// Which process a Blender session is, and who may act on it. A pid alone proves nothing: it is
// reused, and after a reboot session.json may name anything. A session's Blender is proven by its
// start time (/proc) together with its exact job argument, which carries a token made for that one
// start; only a proven process is ever signalled. Where /proc is missing nothing can be proven, so
// no signal is sent and liveness comes from the token over the session's private socket. The name
// lock (`<name>.lock`, created atomically) lets one `start` or `stop` work on a session at a time.

import { type SessionUnreachable, sessionRequest, socketPath } from './blender-session-wire.ts';
import { failed } from './wire.ts';

const POLL_MS = 50;
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface SessionIdentity {
  readonly pid: number;
  readonly token: string;
  /** The session's job file: the argument only this start's Blender was given. */
  readonly job: string;
  /** Field 22 of /proc/<pid>/stat; absent where there is no /proc. */
  readonly startTime?: string;
}

export interface SessionLock {
  /** Still ours: a dead-owner takeover by another process may have raced us. */
  holds(): Promise<boolean>;
  release(): Promise<void>;
}

interface LockOwner {
  readonly token: string;
  readonly pid: number;
  readonly startTime?: string;
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(path, 'utf8').catch(() => undefined);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined; // written whole by rename, so unreadable means another writer's file
  }
}

export const newToken = async (): Promise<string> => {
  const { randomUUID } = await import('node:crypto');
  return randomUUID().replaceAll('-', '');
};

/** When `pid` started, in the kernel's ticks since boot; undefined when it (or /proc) is absent. */
export async function procStartTime(pid: number, proc = '/proc'): Promise<string | undefined> {
  const { readFile } = await import('node:fs/promises');
  const stat = await readFile(`${proc}/${pid}/stat`, 'utf8').catch(() => undefined);
  // The command name may hold spaces and parentheses: count from after its closing one.
  return stat?.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
}

const hasProc = async (proc: string): Promise<boolean> =>
  (await procStartTime(process.pid, proc)) !== undefined;

const signalZero = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** True only for the very process this session started (a zombie has no arguments: false). */
export async function provenSession(id: SessionIdentity, proc = '/proc'): Promise<boolean> {
  const { readFile } = await import('node:fs/promises');
  if (!id.token || !id.job || id.startTime === undefined) return false;
  if ((await procStartTime(id.pid, proc)) !== id.startTime) return false;
  const args = await readFile(`${proc}/${id.pid}/cmdline`, 'utf8').catch(() => '');
  return args.split('\0').includes(id.job);
}

/** Is the session's Blender running? Where /proc exists this is the proof itself. */
export async function sessionAlive(
  id: SessionIdentity,
  dir: string,
  proc = '/proc',
): Promise<boolean> {
  if (await hasProc(proc)) return provenSession(id, proc);
  if (!signalZero(id.pid)) return false;
  try {
    const hello = await sessionRequest(socketPath(dir), { cmd: 'hello' }, 1_000);
    return hello['token'] === id.token;
  } catch (e) {
    // Only this user's process can listen in the private directory: slow means busy.
    return (e as SessionUnreachable).why === 'timeout';
  }
}

async function waitForExit(id: SessionIdentity, dir: string, ms: number): Promise<boolean> {
  for (let left = ms; left > 0; left -= POLL_MS) {
    if (!(await sessionAlive(id, dir))) return true;
    await sleep(POLL_MS);
  }
  return !(await sessionAlive(id, dir));
}

/** Signal the session's Blender, proving it again right before; false when it is not proven. */
async function signalProven(id: SessionIdentity, signal: NodeJS.Signals): Promise<boolean> {
  if (!(await provenSession(id))) return false;
  try {
    process.kill(id.pid, signal);
  } catch {
    return false; // it exited in between
  }
  return true;
}

/** Ask the session to stop, then signal it if it is proven ours. Returns how it ended. */
export async function endSession(
  id: SessionIdentity,
  dir: string,
  graceMs: number,
): Promise<string> {
  await sessionRequest(socketPath(dir), { cmd: 'stop' }, Math.min(graceMs, 5_000)).catch(
    () => undefined,
  );
  if (await waitForExit(id, dir, graceMs)) return 'stopped';
  if (await signalProven(id, 'SIGTERM')) {
    if (await waitForExit(id, dir, Math.min(graceMs, 5_000))) return 'terminated';
    await signalProven(id, 'SIGKILL');
    if (await waitForExit(id, dir, 5_000)) return 'killed';
  }
  return failed(
    `Blender session process ${id.pid} did not stop and cannot be proven to be this session's`,
    `check that pid yourself and end it if it is Blender; its directory ${dir} was kept`,
  );
}

async function ownerAlive(o: LockOwner): Promise<boolean> {
  if (await hasProc('/proc')) return (await procStartTime(o.pid)) === o.startTime;
  return signalZero(o.pid);
}

const code = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

/** Take the session name for this `start` or `stop`; a live holder means refusal. */
export async function takeSessionLock(dir: string, name: string): Promise<SessionLock> {
  const { link, readFile, rename, rm, writeFile } = await import('node:fs/promises');
  const path = `${dir}.lock`;
  const token = await newToken();
  const startTime = await procStartTime(process.pid);
  const mine: LockOwner = { token, pid: process.pid, ...(startTime ? { startTime } : {}) };
  const draft = `${path}.${token}`;
  await writeFile(draft, JSON.stringify(mine), { mode: 0o600 });
  try {
    for (let tries = 0; tries < 8; tries++) {
      try {
        await link(draft, path); // atomic, and the file is complete from its first instant
        return {
          holds: async () => (await readJson<LockOwner>(path))?.token === token,
          release: async () => {
            if ((await readJson<LockOwner>(path))?.token === token) await rm(path, { force: true });
          },
        };
      } catch (e) {
        if (code(e) !== 'EEXIST') throw e;
      }
      const owner = await readJson<LockOwner>(path);
      if (owner === undefined) continue; // released just now
      if (await ownerAlive(owner))
        failed(
          `Blender session '${name}' is being started or stopped by process ${owner.pid}`,
          'wait for that command to finish, then try again',
        );
      // A dead owner's lock. Rename is atomic, so one process wins it; if what it won is not the
      // lock it inspected (a new owner slipped in), it goes back, and that owner's holds() decides.
      const stale = `${path}.stale.${token}`;
      const won = await rename(path, stale).then(
        () => true,
        () => false,
      );
      if (won) {
        const got = await readFile(stale, 'utf8').catch(() => '');
        if (!got.includes(owner.token)) await link(stale, path).catch(() => undefined);
        await rm(stale, { force: true });
      }
    }
  } finally {
    await rm(draft, { force: true });
  }
  return failed(
    `could not lock Blender session '${name}'`,
    `remove ${path} if nothing is using it`,
  );
}
