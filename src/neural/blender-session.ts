// A Blender session: one long-lived Blender holding a loaded, half-finished mesh, so chained work
// (a weight tweak and a look) does not relaunch and redo load, clean, retopo, UV and bake. Here is
// the client side of examples/blender/tasks/session.py: start, run a batch of steps, undo, status,
// finish (the kept steps + export as a `t3d-blender-steps/1` program), stop. Every batch is checked
// with the same rules as a program, against the steps already kept. Nothing a session produces is an
// asset: a committed output comes from replaying the finished program with `t3d neural run`.
// Blender never runs in the gate: the tests drive a fake executable that speaks the same socket.

import { Ts23dError } from '../core/index.ts';
import { REVIEW_CRASH_FIX } from './blender-gpu.ts';
import { endSession, readJson, sessionAlive, takeSessionLock } from './blender-session-process.ts';
import {
  logTail,
  type SessionFiles,
  type SessionMeta,
  type SpawnOptions,
  spawnSession,
} from './blender-session-start.ts';
import {
  privateDir,
  type SessionReply,
  SessionUnreachable,
  sessionRequest,
  sessionsRoot,
  socketPath,
} from './blender-session-wire.ts';
import { invalidStep } from './blender-step-fields.ts';
import { type BlenderStep, blenderProgram, checkBlenderSteps } from './blender-steps.ts';
import { sha256Hex } from './sha256.ts';
import { failed } from './wire.ts';

export const SESSION_REPLAY_NOTE =
  'A session is for working out the steps. Committed assets come from replaying this program with `t3d neural run`, never from session state.';

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const FORBIDDEN: readonly string[] = ['export', 'skinBody', 'metaballs'];
const STATUS_MS = 3_000;

export interface BlenderSessionOptions {
  readonly name?: string;
  /** Directory holding the sessions (default: ~/.cache/t3d/blender-sessions). */
  readonly root?: string;
  /** How long `stop` waits for each stage before going further (default 10 s). */
  readonly stopGraceMs?: number;
}
export type BlenderSessionStart = BlenderSessionOptions & SpawnOptions;
export type BlenderBatch = Readonly<Record<string, unknown>>;

interface Kept {
  readonly revision: number;
  readonly steps: readonly BlenderStep[];
}

async function filesOf(o: BlenderSessionOptions): Promise<SessionFiles> {
  const name = o.name ?? 'default';
  if (!NAME.test(name))
    failed(
      `'${name}' is not a session name`,
      'use lowercase letters, digits, - and _ (32 at most)',
    );
  const root = await sessionsRoot(o.root);
  await privateDir(root);
  return { name, dir: `${root}/${name}` };
}

const metaOf = (f: SessionFiles): Promise<SessionMeta | undefined> =>
  readJson<SessionMeta>(`${f.dir}/session.json`);

async function isLive(f: SessionFiles, meta: SessionMeta | undefined): Promise<boolean> {
  return meta !== undefined && (await sessionAlive(meta, f.dir));
}

/** The reason a session is gone, and what still works, as an error. Removes its stale socket. */
async function gone(f: SessionFiles, meta: SessionMeta | undefined): Promise<never> {
  const { readdir, rm } = await import('node:fs/promises');
  await rm(`${f.dir}/sock`, { force: true });
  for (const name of await readdir(f.dir).catch(() => [] as string[]))
    if (name.startsWith('checkpoint-')) await rm(`${f.dir}/${name}`, { force: true });
  if (meta === undefined)
    failed(`no Blender session '${f.name}'`, 'start one: t3d blender session start --mesh <glb>');
  const ended = await readJson<{ reason?: string }>(`${f.dir}/ended.json`);
  const report = await readJson<{ error?: string }>(`${f.dir}/report.json`);
  const doing = await readJson<{ op?: string | null }>(`${f.dir}/activity.json`);
  const again = `t3d blender session start --mesh ${meta?.mesh ?? '<glb>'}`;
  const keep = `finish --out <program.json> still writes the kept steps; then ${again}`;
  if (ended?.reason === 'idle')
    failed(`Blender session '${f.name}' ended after its idle limit`, keep);
  if (ended?.reason === 'stopped') failed(`Blender session '${f.name}' was stopped`, keep);
  const logged = (await logTail(f.dir, 400))
    .split('\n')
    .filter((l) => /error|traceback|segmentation|crash|killed/i.test(l))
    .slice(-4)
    .join('\n');
  const why = report?.error ?? (logged || `nothing in its log (${f.dir}/session.log)`);
  const running = doing?.op ? ` while running ${doing.op}` : '';
  return failed(
    `the Blender process of session '${f.name}' died${running}: ${why}`,
    doing?.op === 'review' ? `${REVIEW_CRASH_FIX}. ${keep}` : keep,
  );
}

async function ask(f: SessionFiles, value: unknown, timeoutMs: number): Promise<SessionReply> {
  const meta = await metaOf(f);
  if (!(await isLive(f, meta))) return gone(f, meta);
  try {
    return await sessionRequest(socketPath(f.dir), value, timeoutMs);
  } catch (e) {
    if (!(e instanceof SessionUnreachable)) throw e;
    if (e.why === 'timeout')
      failed(
        `Blender session '${f.name}' did not answer within ${timeoutMs} ms`,
        'it may still be working: check `t3d blender session status`, or raise --timeout',
      );
    return gone(f, meta);
  }
}

/** A failed reply as an error; an op's own "fix:" text becomes the error's fix. */
function refuse(r: SessionReply): never {
  const message = String(r['error'] ?? 'the session refused the request');
  const at = message.indexOf('fix:');
  const fix = at >= 0 ? message.slice(at + 4).trim() : String(r['fix'] ?? 'read the message');
  const where =
    typeof r['step'] === 'number' ? `batch step ${r['step']} (${String(r['op'])}): ` : '';
  const back = r['restored'] === true ? ' The session is back where it was before the batch.' : '';
  const trimmed = (at >= 0 ? message.slice(0, at).trim() : message).replace(
    /^step \d+ \(\w+\): /,
    '',
  );
  return failed(`${where}${trimmed}${back}`, fix);
}

const keptOf = async (f: SessionFiles): Promise<Kept> => {
  const kept = await readJson<Kept>(`${f.dir}/kept.json`);
  return kept ?? failed(`session '${f.name}' has no kept steps`, 'start it again');
};

/** Start a session; refuses a name that is already running. */
export async function startBlenderSession(
  o: BlenderSessionStart,
): Promise<Record<string, unknown>> {
  const f = await filesOf(o);
  const lock = await takeSessionLock(f.dir, f.name);
  try {
    const meta = await metaOf(f);
    if (await isLive(f, meta))
      failed(
        `Blender session '${f.name}' is already running (pid ${meta?.pid})`,
        `stop it first (t3d blender session stop --name ${f.name}), or start another with --name`,
      );
    const started = await spawnSession(f, o, lock);
    return { name: f.name, dir: f.dir, pid: started.meta.pid, ...started.ready };
  } finally {
    await lock.release();
  }
}

/** Check `steps` as the next batch, then run them. The reply carries one fact entry per step. */
export async function runBlenderBatch(
  o: BlenderSessionOptions & { readonly timeoutMs?: number },
  steps: readonly unknown[],
): Promise<BlenderBatch> {
  const f = await filesOf(o);
  if (steps.length === 0) failed('the batch has no steps', 'list at least one step');
  const kept = await keptOf(f);
  steps.forEach((s, i) => {
    const op = String((s as { op?: unknown } | null)?.op);
    if (FORBIDDEN.includes(op))
      invalidStep(
        `batch step ${i} (${op})`,
        op === 'export' ? 'a session does not export' : 'a session starts from its --mesh',
        op === 'export'
          ? 'run `t3d blender session finish --out <program.json>`, then replay it'
          : 'drop the step, or use it in a program',
      );
  });
  const whole = [...kept.steps, ...(steps as readonly BlenderStep[]), { op: 'export' } as const];
  let checked: readonly BlenderStep[];
  try {
    checked = checkBlenderSteps(whole);
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    throw new Ts23dError(e.code, {
      cause: `${e.message} (steps before ${kept.steps.length} are the session's kept steps)`,
      fix: e.fix,
    });
  }
  const batch = checked.slice(kept.steps.length, -1);
  const reply = await ask(
    f,
    { cmd: 'run', revision: kept.revision, steps: batch },
    o.timeoutMs ?? 7_200_000,
  );
  return reply.ok ? reply : refuse(reply);
}

export async function undoBlenderBatch(o: BlenderSessionOptions): Promise<BlenderBatch> {
  const reply = await ask(await filesOf(o), { cmd: 'undo' }, 600_000);
  return reply.ok ? reply : refuse(reply);
}

/** Live facts, or `busy` with the step being worked on when Blender is inside a batch. */
export async function blenderSessionStatus(o: BlenderSessionOptions): Promise<BlenderBatch> {
  const f = await filesOf(o);
  const meta = await metaOf(f);
  if (!(await isLive(f, meta))) return gone(f, meta);
  const base = { name: f.name, dir: f.dir, mesh: meta?.mesh };
  try {
    return {
      ...base,
      busy: false,
      ...(await sessionRequest(socketPath(f.dir), { cmd: 'status' }, STATUS_MS)),
    };
  } catch (e) {
    if (!(e instanceof SessionUnreachable)) throw e;
    if (e.why !== 'timeout') return gone(f, meta);
    const activity = await readJson<Record<string, unknown>>(`${f.dir}/activity.json`);
    return { ...base, ok: true, busy: true, pid: meta?.pid, activity };
  }
}

/** Write the kept steps + export as a program. Works on a session that has since ended. */
export async function finishBlenderSession(
  o: BlenderSessionOptions & {
    readonly out: string;
    readonly export?: Omit<Extract<BlenderStep, { op: 'export' }>, 'op'>;
  },
): Promise<BlenderBatch> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  const f = await filesOf(o);
  const meta = await metaOf(f);
  if (meta === undefined)
    failed(`no Blender session '${f.name}'`, 'start one: t3d blender session start --mesh <glb>');
  const kept = await keptOf(f);
  if (kept.steps.length === 0)
    failed(`session '${f.name}' has no kept steps`, 'run a batch before finishing');
  const bytes = blenderProgram([...kept.steps, { op: 'export', ...o.export }]);
  await mkdir(dirname(o.out), { recursive: true });
  await writeFile(o.out, bytes);
  return {
    out: o.out,
    sha256: sha256Hex(bytes),
    steps: kept.steps.map((s) => s.op),
    mesh: meta?.mesh,
    meshSha256: meta?.meshSha256,
    ...(meta?.skeleton ? { skeleton: meta.skeleton, skeletonSha256: meta.skeletonSha256 } : {}),
    note: SESSION_REPLAY_NOTE,
  };
}

/** End the process (politely, then by signal if proven ours) and remove the session's directory. */
export async function stopBlenderSession(o: BlenderSessionOptions): Promise<BlenderBatch> {
  const { rm, stat } = await import('node:fs/promises');
  const f = await filesOf(o);
  const lock = await takeSessionLock(f.dir, f.name);
  try {
    const meta = await metaOf(f);
    const there = await stat(f.dir).then(
      () => true,
      () => false,
    );
    const live = meta !== undefined && (await isLive(f, meta));
    const how = live ? await endSession(meta, f.dir, o.stopGraceMs ?? 10_000) : 'not running';
    if (!(await lock.holds()))
      failed(`lost the lock on session '${f.name}'`, 'its directory was kept: run stop again');
    await rm(f.dir, { recursive: true, force: true });
    return { name: f.name, stopped: how, removed: there };
  } finally {
    await lock.release();
  }
}
