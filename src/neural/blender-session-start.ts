// Starting and ending the Blender process of a session (blender-session.ts): spawn it detached with
// its output in session.log, wait for ready.json (or a report saying why it could not start), and
// the process checks every other command relies on: alive and really this session's Blender (a pid
// can be reused), killed only when it is.

import { blenderAdapter } from './blender-adapter.ts';
import { findLavapipe, SOFTWARE_GPU_ARGS, softwareGpuEnv } from './blender-gpu.ts';
import { blenderJobArgs, blenderScriptsDir } from './blender-scripts.ts';
import { privateDir, socketPath } from './blender-session-wire.ts';
import { sha256Hex } from './sha256.ts';
import { setupFix } from './tool-spawn.ts';
import { failed } from './wire.ts';

export interface SessionFiles {
  readonly dir: string;
  readonly name: string;
}

/** What `start` records beside the session: enough to explain and replay it later. */
export interface SessionMeta {
  readonly contract: 't3d-blender-session/1';
  readonly name: string;
  readonly pid: number;
  readonly mesh: string;
  readonly meshSha256: string;
  readonly skeleton?: string;
  readonly skeletonSha256?: string;
  readonly scripts: string;
}

export interface SpawnOptions {
  readonly exe?: string;
  readonly scriptsDir?: string;
  readonly mesh: string;
  readonly skeleton?: string;
  readonly threads?: number;
  readonly idleSeconds?: number;
  readonly undoDepth?: number;
  readonly softwareGpu?: boolean;
  readonly startTimeoutMs?: number;
}

const POLL_MS = 50;
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

export async function logTail(dir: string, lines = 12): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(`${dir}/session.log`, 'utf8').catch(() => '');
  return text.trimEnd().split('\n').slice(-lines).join('\n');
}

/** The pid is running and its command line names this session's directory. */
export async function isSessionProcess(pid: number, dir: string): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  const { readFile } = await import('node:fs/promises');
  const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => undefined);
  return cmd === undefined || cmd.includes(dir);
}

export async function waitForExit(pid: number, dir: string, ms: number): Promise<boolean> {
  for (let left = ms; left > 0; left -= POLL_MS) {
    if (!(await isSessionProcess(pid, dir))) return true;
    await sleep(POLL_MS);
  }
  return !(await isSessionProcess(pid, dir));
}

async function fileBytes(path: string, what: string): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  const b = await readFile(path).catch(() => undefined);
  if (b === undefined) return failed(`${what} ${path} does not exist`, 'check the path');
  return new Uint8Array(b);
}

/** Launch Blender on the session directory and wait until it serves. Returns its ready facts. */
export async function spawnSession(
  files: SessionFiles,
  o: SpawnOptions,
): Promise<{ meta: SessionMeta; ready: Readonly<Record<string, unknown>> }> {
  const { open, rm, writeFile } = await import('node:fs/promises');
  const { spawn } = await import('node:child_process');
  const { resolve } = await import('node:path');
  const exe = o.exe ?? 'blender';
  const threads = o.threads ?? 1;
  const dir = files.dir;
  const scripts = await blenderScriptsDir(o.scriptsDir);
  await blenderAdapter({ exe, scriptsDir: scripts }).models(); // tool present, supported line
  const mesh = resolve(o.mesh);
  const meshSha256 = sha256Hex(await fileBytes(mesh, '--mesh'));
  const skeleton = o.skeleton === undefined ? undefined : resolve(o.skeleton);
  const skeletonSha256 =
    skeleton === undefined ? undefined : sha256Hex(await fileBytes(skeleton, '--skeleton'));
  const manifest = o.softwareGpu ? await findLavapipe() : undefined;
  await rm(dir, { recursive: true, force: true });
  await privateDir(dir);
  socketPath(dir);
  const job = {
    contract: 't3d-blender/1',
    task: 'session',
    threads,
    inputs: { [meshSha256]: mesh, ...(skeletonSha256 ? { [skeletonSha256]: skeleton } : {}) },
    request: {
      mesh: { sha256: meshSha256, mime: 'model/gltf-binary' },
      ...(skeletonSha256 ? { skeleton: { sha256: skeletonSha256, mime: 'application/json' } } : {}),
      params: { threads },
      session: { idleSeconds: o.idleSeconds ?? 1800, undoDepth: o.undoDepth ?? 5 },
    },
  };
  await writeFile(`${dir}/job.json`, JSON.stringify(job), { mode: 0o600 });
  const log = await open(`${dir}/session.log`, 'a', 0o600);
  const args = [
    ...(manifest ? SOFTWARE_GPU_ARGS : []),
    ...blenderJobArgs('blender', `${scripts}/ts23d_job.py`, `${dir}/job.json`, threads),
  ];
  const child = spawn(exe, args, {
    cwd: dir,
    detached: true,
    stdio: ['ignore', log.fd, log.fd],
    env: { ...process.env, ...(manifest ? softwareGpuEnv(manifest) : {}) },
  });
  // Listen before anything awaits: a Blender that dies at once must not exit unheard.
  let exited: string | undefined;
  child.on('error', (e) => {
    exited = `could not start: ${e.message}`;
  });
  child.on('exit', (code, signal) => {
    exited = `exited ${code ?? signal}`;
  });
  await log.close();
  child.unref();
  const pid = child.pid;
  const limit = o.startTimeoutMs ?? 600_000;
  for (let waited = 0; waited < limit; waited += POLL_MS) {
    const ready = await readJson<Readonly<Record<string, unknown>>>(`${dir}/ready.json`);
    if (ready !== undefined && pid !== undefined) {
      const meta: SessionMeta = {
        contract: 't3d-blender-session/1',
        name: files.name,
        pid,
        mesh,
        meshSha256,
        ...(skeleton && skeletonSha256 ? { skeleton, skeletonSha256 } : {}),
        scripts,
      };
      await writeFile(`${dir}/session.json`, JSON.stringify(meta), { mode: 0o600 });
      return { meta, ready };
    }
    if (exited !== undefined) {
      const report = await readJson<{ error?: string }>(`${dir}/report.json`);
      const why = report?.error ?? (await logTail(dir));
      if (exited.startsWith('could not start')) failed(`blender ${exited}`, setupFix('blender'));
      failed(`the Blender session did not start (${exited}): ${why}`, `read ${dir}/session.log`);
    }
    await sleep(POLL_MS);
  }
  if (pid !== undefined) process.kill(pid, 'SIGKILL');
  return failed(
    `the Blender session was not ready within ${limit} ms: ${await logTail(dir, 4)}`,
    'a very large mesh loads slowly: raise the start timeout, or read session.log',
  );
}
