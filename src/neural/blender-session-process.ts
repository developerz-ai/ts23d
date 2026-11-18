// Which process a Blender session is, and who may act on it. A pid alone proves nothing: it is
// reused, and after a reboot session.json may name anything. A session's Blender is proven by its
// start time (/proc) together with its exact job argument, which carries a token made for that one
// start; only a proven process is ever signalled. Where /proc is missing nothing can be proven, so
// no signal is sent and liveness comes from the token over the session's private socket.
// The name lock lets one `start` or `stop` work on a session at a time. It is a chain of numbered
// files, `<name>.lock.<n>`: generation n + 1 may be created (atomically, once) only after generation
// n's owner has released it or died, and no one but its owner ever changes a file that may be live.
// Recovery from a dead owner is therefore just the next link; there is nothing to steal.

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
  readonly released?: boolean;
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
  probeMs = 1_000,
): Promise<boolean> {
  if (await hasProc(proc)) return provenSession(id, proc);
  if (!signalZero(id.pid)) return false;
  try {
    const hello = await sessionRequest(socketPath(dir), { cmd: 'hello' }, probeMs);
    return hello['token'] === id.token;
  } catch (e) {
    // Only this user's process can listen in the private directory: slow means busy.
    return (e as SessionUnreachable).why === 'timeout';
  }
}

const nowMs = (): number => Number(process.hrtime.bigint() / 1_000_000n);

/** True once the session is gone; false at `ms`, however long each look at it takes. */
export async function waitForExit(
  id: SessionIdentity,
  dir: string,
  ms: number,
  proc = '/proc',
): Promise<boolean> {
  const deadline = nowMs() + ms;
  for (;;) {
    const left = deadline - nowMs();
    if (left <= 0) return false;
    if (!(await sessionAlive(id, dir, proc, Math.min(left, 1_000)))) return true;
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - nowMs())));
  }
}

/** Signal the session's Blender, proving it again right before; false when it is not proven. */
async function signalProven(
  id: SessionIdentity,
  signal: NodeJS.Signals,
  proc: string,
): Promise<boolean> {
  if (!(await provenSession(id, proc))) return false;
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
  proc = '/proc',
): Promise<string> {
  await sessionRequest(socketPath(dir), { cmd: 'stop' }, Math.min(graceMs, 5_000)).catch(
    () => undefined,
  );
  if (await waitForExit(id, dir, graceMs, proc)) return 'stopped';
  if (await signalProven(id, 'SIGTERM', proc)) {
    if (await waitForExit(id, dir, Math.min(graceMs, 5_000), proc)) return 'terminated';
    await signalProven(id, 'SIGKILL', proc);
    if (await waitForExit(id, dir, 5_000, proc)) return 'killed';
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

/** The generations of `name`'s lock that exist, lowest first. */
async function generations(root: string, name: string): Promise<number[]> {
  const { readdir } = await import('node:fs/promises');
  const prefix = `${name}.lock.`;
  return (await readdir(root))
    .filter((f) => f.startsWith(prefix) && /^\d+$/.test(f.slice(prefix.length)))
    .map((f) => Number(f.slice(prefix.length)))
    .sort((a, b) => a - b);
}

/**
 * Take the session name for this `start` or `stop`; a live holder means refusal. `beforeClaim` runs
 * between deciding the top generation is free and claiming the next: tests delay a contender there.
 */
export async function takeSessionLock(
  dir: string,
  name: string,
  beforeClaim?: () => Promise<void>,
): Promise<SessionLock> {
  const { link, rename, rm, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const root = dirname(dir);
  const file = (n: number): string => `${dir}.lock.${n}`;
  const token = await newToken();
  const startTime = await procStartTime(process.pid);
  const mine: LockOwner = { token, pid: process.pid, ...(startTime ? { startTime } : {}) };
  const draft = `${dir}.draft.${token}`;
  await writeFile(draft, JSON.stringify(mine), { mode: 0o600 });
  try {
    for (let tries = 0; tries < 64; tries++) {
      const top = (await generations(root, name)).at(-1) ?? 0;
      if (top > 0) {
        const owner = await readJson<LockOwner>(file(top));
        if (owner === undefined) continue; // tidied away: a newer generation exists
        if (!owner.released && (await ownerAlive(owner)))
          failed(
            `Blender session '${name}' is being started or stopped by process ${owner.pid}`,
            'wait for that command to finish, then try again',
          );
      }
      await beforeClaim?.();
      const next = top + 1;
      try {
        await link(draft, file(next)); // atomic: one claimant per generation, complete at once
      } catch (e) {
        if (code(e) !== 'EEXIST') throw e;
        continue;
      }
      // A contender delayed since an old generation can re-create a tidied number: not the top.
      const now = await generations(root, name);
      if (now.at(-1) !== next) {
        await rm(file(next), { force: true });
        continue;
      }
      for (const old of now) if (old < next) await rm(file(old), { force: true });
      const holds = async (): Promise<boolean> =>
        (await generations(root, name)).at(-1) === next &&
        (await readJson<LockOwner>(file(next)))?.token === token;
      return {
        holds,
        release: async () => {
          if (!(await holds())) return;
          // The file stays, marked: the chain's top must never disappear.
          const done = `${draft}.released`;
          await writeFile(done, JSON.stringify({ ...mine, released: true }), { mode: 0o600 });
          await rename(done, file(next));
        },
      };
    }
  } finally {
    await rm(draft, { force: true });
  }
  return failed(`could not lock Blender session '${name}'`, 'too much contention: try again');
}
