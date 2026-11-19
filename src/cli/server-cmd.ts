// `t3d server start|stop|status [--profile <name|file.toml>] [--port N] [--timeout <s>]`: runs the
// reference model server (examples/neural-server/server.py) in the background on 127.0.0.1:8190.
// Python: the setup venv ($TS23D_NEURAL_VENV or $TS23D_HOME/neural/.venv) when there is one, else
// `uv run` in the server's own locked env (enough for the dummy profile). Profile: --profile, else
// $TS23D_HOME/neural/server.toml (written by `t3d setup gpu-*`), else dummy. One model is resident at
// a time (the server's rule). State in $TS23D_HOME/neural/server.pid, output in server.log.

import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { isTs23dError, Ts23dError } from '../core/index.ts';
import { oneOf, usage } from './flags.ts';
import { envelope, printError } from './report.ts';
import {
  type Host,
  realHost,
  SERVER_PORT,
  serverDir,
  serverDirFix,
  type TierPaths,
  tierPaths,
} from './tier-probe.ts';

export interface ServerState {
  readonly pid: number;
  readonly port: number;
  readonly profile: string;
  readonly cmd: readonly string[];
  readonly log: string;
  readonly startedAt: string;
}

export interface ServedModel {
  readonly id: string;
  readonly task: string;
}

export function readState(p: TierPaths): ServerState | undefined {
  try {
    return JSON.parse(readFileSync(p.pidFile, 'utf8')) as ServerState;
  } catch {
    return undefined;
  }
}

export const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** GET /v1/models, or undefined when nothing answers within `ms`. */
export async function servedModels(
  host: Host,
  port: number,
  ms = 2000,
): Promise<ServedModel[] | undefined> {
  try {
    const r = await host.fetch(`http://127.0.0.1:${port}/v1/models`, {
      signal: AbortSignal.timeout(ms),
    });
    if (!r.ok) return undefined;
    const body = (await r.json()) as unknown;
    return Array.isArray(body) ? (body as ServedModel[]) : undefined;
  } catch {
    return undefined;
  }
}

/** The profile file to run: a path, a name under the server's profiles/, or the default. */
export function profileFile(host: Host, p: TierPaths, dir: string, want?: string): string {
  if (want?.endsWith('.toml')) return resolve(want);
  if (want) return join(dir, 'profiles', `${want}.toml`);
  return host.exists(p.serverToml) ? p.serverToml : join(dir, 'profiles', 'dummy.toml');
}

/** argv + environment that start the server (pure: tested without spawning). */
export function serverCommand(
  host: Host,
  p: TierPaths,
  dir: string,
  profile: string,
  port: number,
): { cmd: string[]; env: Record<string, string> } {
  const tail = [join(dir, 'server.py'), '--profile', profile, '--port', String(port)];
  const uv = host.exists(join(p.bin, 'uv')) ? join(p.bin, 'uv') : 'uv';
  const cmd = host.exists(p.python)
    ? [p.python, ...tail]
    : [uv, 'run', '--project', dir, '--frozen', '--no-dev', 'python', ...tail];
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(host.env)) if (v !== undefined) env[k] = v;
  env['HF_HOME'] ??= p.hfHome;
  env['PYTORCH_CUDA_ALLOC_CONF'] ??= 'expandable_segments:True';
  env['OPENCV_IO_ENABLE_OPENEXR'] ??= '1';
  if (host.exists(p.cudaHome)) {
    env['CUDA_HOME'] = p.cudaHome;
    env['PATH'] = [p.toolchain, join(p.cudaHome, 'bin'), env['PATH'] ?? ''].join(':');
    env['LD_LIBRARY_PATH'] = [join(p.cudaHome, 'lib64'), env['LD_LIBRARY_PATH'] ?? ''].join(':');
  }
  return { cmd, env };
}

const logTail = (log: string): string => {
  try {
    return readFileSync(log, 'utf8').trimEnd().split('\n').slice(-25).join('\n');
  } catch {
    return '(no log)';
  }
};

export interface ServerStatus {
  readonly running: boolean;
  readonly url: string;
  readonly pid?: number;
  readonly profile?: string;
  readonly models?: readonly ServedModel[];
  /** Something answers on the port that `t3d server` did not start. */
  readonly foreign?: boolean;
  readonly log: string;
}

export async function serverStatus(host: Host, p: TierPaths, port?: number): Promise<ServerStatus> {
  const st = readState(p);
  const mine = st !== undefined && alive(st.pid);
  const at = port ?? (mine ? st.port : SERVER_PORT);
  const models = await servedModels(host, at);
  const base = { url: `http://127.0.0.1:${at}`, log: p.serverLog };
  if (mine)
    return {
      ...base,
      running: true,
      pid: st.pid,
      profile: st.profile,
      ...(models ? { models } : {}),
    };
  return models ? { ...base, running: true, foreign: true, models } : { ...base, running: false };
}

export async function serverStart(
  host: Host,
  p: TierPaths,
  o: { profile?: string; port: number; timeoutMs: number },
): Promise<ServerStatus & { already: boolean }> {
  const now = await serverStatus(host, p, o.port);
  if (now.running) return { ...now, already: true };
  const dir = serverDir(host);
  if (!dir)
    throw new Ts23dError('T3D_NEURAL_FAILED', {
      cause: 'examples/neural-server not found',
      fix: serverDirFix,
    });
  const profile = profileFile(host, p, dir, o.profile);
  if (!host.exists(profile))
    throw usage(
      `server profile ${profile} does not exist`,
      `pass --profile dummy|rtx3090|full or a .toml path`,
    );
  const { cmd, env } = serverCommand(host, p, dir, profile, o.port);
  mkdirSync(dirname(p.serverLog), { recursive: true });
  const fd = openSync(p.serverLog, 'a');
  const [exe = '', ...args] = cmd;
  const child = spawn(exe, args, { cwd: dir, env, detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  let exited: number | null | undefined;
  child.on('exit', (code) => {
    exited = code;
  });
  child.on('error', () => {
    exited = -1;
  });
  child.unref();
  const pid = child.pid ?? -1;
  const state: ServerState = {
    pid,
    port: o.port,
    profile,
    cmd,
    log: p.serverLog,
    startedAt: new Date().toISOString(),
  };
  writeFileSync(p.pidFile, `${JSON.stringify(state, null, 2)}\n`);
  const deadline = Date.now() + o.timeoutMs;
  while (Date.now() < deadline && exited === undefined) {
    const models = await servedModels(host, o.port, 1000);
    if (models)
      return {
        running: true,
        url: `http://127.0.0.1:${o.port}`,
        pid,
        profile,
        models,
        log: p.serverLog,
        already: false,
      };
    await new Promise((r) => setTimeout(r, 400));
  }
  if (exited === undefined) await serverStop(p);
  rmSync(p.pidFile, { force: true });
  throw new Ts23dError('T3D_NEURAL_FAILED', {
    cause: `the server ${exited === undefined ? `did not answer within ${o.timeoutMs / 1000} s` : `exited (${exited}) before answering`}:\n${logTail(p.serverLog)}`,
    fix: `read ${p.serverLog}; \`t3d doctor\` names what is missing (venv, weights); raise --timeout for big profiles`,
  });
}

export async function serverStop(p: TierPaths): Promise<{ stopped: boolean; pid?: number }> {
  const st = readState(p);
  if (!st || !alive(st.pid)) {
    rmSync(p.pidFile, { force: true });
    return { stopped: false };
  }
  const kill = (sig: NodeJS.Signals): void => {
    try {
      process.kill(-st.pid, sig);
    } catch {
      if (alive(st.pid)) process.kill(st.pid, sig);
    }
  };
  kill('SIGTERM');
  for (let i = 0; i < 50 && alive(st.pid); i++) await new Promise((r) => setTimeout(r, 200));
  if (alive(st.pid)) kill('SIGKILL');
  rmSync(p.pidFile, { force: true });
  return { stopped: true, pid: st.pid };
}

const SUBS = ['start', 'stop', 'status'] as const;

function options(argv: readonly string[]): { profile?: string; port: number; timeoutMs: number } {
  const o: { profile?: string; port: number; timeoutMs: number } = {
    port: SERVER_PORT,
    timeoutMs: 120_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const v = argv[i + 1];
    if (a === '--json') continue;
    const num = (name: string): number => {
      const n = Number(v);
      if (!Number.isInteger(n) || n <= 0)
        throw usage(`${name} needs a positive integer, got '${v ?? ''}'`, `${name} 8190`);
      i++;
      return n;
    };
    if (a === '--profile' && v) {
      o.profile = v;
      i++;
    } else if (a === '--port') o.port = num('--port');
    else if (a === '--timeout') o.timeoutMs = num('--timeout') * 1000;
    else
      throw usage(
        `t3d server: unknown argument '${a}'`,
        't3d server start|stop|status [--profile <name|file.toml>] [--port N] [--timeout <s>]',
      );
  }
  return o;
}

const line = (s: ServerStatus): string =>
  s.running
    ? `${s.foreign ? 'a server not started by t3d answers' : `running (pid ${s.pid})`} on ${s.url}${s.profile ? ` · profile ${s.profile}` : ''}\n  models: ${(s.models ?? []).map((m) => `${m.id} (${m.task})`).join(', ') || 'not answering yet'}\n  log: ${s.log}`
    : `stopped (start it: t3d server start [--profile dummy])`;

export async function serverMain(
  argv: readonly string[],
  json: boolean,
  host = realHost(),
): Promise<number> {
  try {
    const sub = oneOf('t3d server', argv[0], SUBS);
    const o = options(argv.slice(1));
    const p = tierPaths(host.env);
    if (sub === 'stop') {
      const r = await serverStop(p);
      if (json) envelope(true, r);
      else console.log(r.stopped ? `stopped (pid ${r.pid})` : 'not running');
      return 0;
    }
    const s =
      sub === 'start'
        ? await serverStart(host, p, o)
        : await serverStatus(host, p, argv.includes('--port') ? o.port : undefined);
    if (json) envelope(true, s);
    else console.log(`${'already' in s && s.already ? 'already ' : ''}${line(s)}`);
    return 0;
  } catch (e) {
    if (isTs23dError(e)) return printError(e, json);
    throw e;
  }
}
