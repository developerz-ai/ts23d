// The process plumbing every tool adapter shares (Blender, Godot, basisu, gltfpack): spawn one
// executable with a deadline and an output cap, in a throwaway work directory, and turn every way
// it can go wrong into T3D_NEURAL_FAILED with a fix — a missing tool names `t3d setup tools`, a
// crash carries the last 40 lines of stderr. Node built-ins are imported lazily, inside the calls,
// so the library stays importable in a browser (the gallery) where no tool can run. Tool models
// carry the tool's version and script hash in `weightsSha256`: an upgrade is a cache miss.

import type { NeuralTask } from '../core/index.ts';
import { canonicalJson, type NeuralModelInfo, type NeuralToolInfo } from './adapter.ts';
import { sha256Hex } from './sha256.ts';
import { failed } from './wire.ts';

export interface ToolProc {
  /** Exit code; null when killed. */
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** The executable could not be started (not found, not executable). */
  readonly missing: boolean;
}

export interface ToolExecOptions {
  readonly cwd?: string;
  readonly timeoutMs: number;
  /** Bytes kept per stream (the tail). */
  readonly maxBytes: number;
}

/** Runs one process; injectable for tests and for hosts with their own process API. */
export type ToolExec = (
  exe: string,
  args: readonly string[],
  o: ToolExecOptions,
) => Promise<ToolProc>;

/** `node:child_process` spawn (Bun and Node), no shell, stdin closed. */
export const nodeExec: ToolExec = async (exe, args, o) => {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const keep = (list: Buffer[], b: Buffer): void => {
      list.push(b);
      let n = list.reduce((s, x) => s + x.length, 0);
      while (n > o.maxBytes && list.length > 1) n -= list.shift()?.length ?? 0;
    };
    let timedOut = false;
    let missing = false;
    // Own process group, so a timeout kills the tool's children too (they hold the pipes open).
    const child = spawn(exe, [...args], {
      ...(o.cwd ? { cwd: o.cwd } : {}),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid !== undefined && process.platform !== 'win32')
          process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, o.timeoutMs);
    child.stdout.on('data', (b: Buffer) => keep(out, b));
    child.stderr.on('data', (b: Buffer) => keep(err, b));
    child.on('error', (e: NodeJS.ErrnoException) => {
      missing = e.code === 'ENOENT' || e.code === 'EACCES';
      if (!missing) err.push(Buffer.from(String(e.message)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
        missing,
      });
    });
  });
};

/** The fix for a tool that is not there. */
export const setupFix = (tool: string): string =>
  `run \`t3d setup tools\` (installs ${tool} into ~/.ts23d/tools), or pass exe: '/path/to/${tool}' to the adapter`;

const tail = (s: string, lines = 40): string => s.trimEnd().split('\n').slice(-lines).join('\n');

export interface ToolCall extends ToolExecOptions {
  /** Display name: 'blender', 'godot', 'basisu', 'gltfpack'. */
  readonly tool: string;
  readonly exe: string;
  readonly args: readonly string[];
  readonly exec: ToolExec;
}

/** Run a tool; anything but exit 0 is T3D_NEURAL_FAILED with the reason and stderr tail. */
export async function runTool(c: ToolCall): Promise<ToolProc> {
  return checkProc(c, await c.exec(c.exe, c.args, c));
}

/** A finished process → itself, or T3D_NEURAL_FAILED (`why` leads the cause when given). */
export function checkProc(c: Omit<ToolCall, 'exec'>, p: ToolProc, why?: string): ToolProc {
  if (p.missing) failed(`${c.tool} not found at '${c.exe}'`, setupFix(c.tool));
  if (p.timedOut)
    failed(
      `${c.tool} did not finish within ${c.timeoutMs} ms`,
      `raise timeoutMs (now ${c.timeoutMs}) or ask for a smaller job`,
    );
  if (p.code !== 0 || why)
    failed(
      `${why ? `${why}; ` : ''}${c.tool} exited ${p.code}${p.stderr.trim() ? `:\n${tail(p.stderr)}` : ''}`,
      `rerun by hand: ${c.exe} ${c.args.join(' ')}`,
    );
  return p;
}

/** First capture of `re` in the tool's version output (stdout + stderr). */
export async function probeVersion(c: ToolCall, re: RegExp): Promise<string> {
  const p = await runTool(c);
  const m = re.exec(`${p.stdout}\n${p.stderr}`);
  if (!m?.[1])
    failed(
      `${c.tool} at '${c.exe}' printed no version matching ${re}`,
      `check '${c.exe}' is ${c.tool}; ${setupFix(c.tool)}`,
    );
  return (m?.[1] ?? '').trim();
}

/** A tool's model entry: outputs are the user's ('own'); version + script hash key the cache. */
export function toolModel(id: string, task: NeuralTask, tool: NeuralToolInfo): NeuralModelInfo {
  const key = canonicalJson({ tool: tool.name, version: tool.version, script: tool.scriptSha256 });
  return {
    id,
    task,
    licence: 'own',
    weightsSha256: sha256Hex(new TextEncoder().encode(key)),
    tool,
  };
}

/** A fresh temp directory for one job, removed afterwards whatever happens. */
export async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 't3d-tool-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function writeBytes(path: string, bytes: Uint8Array | string): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, bytes);
}

/** A file a tool wrote, refused when missing or over `maxBytes`. */
export async function readOutput(
  path: string,
  maxBytes: number,
  tool: string,
): Promise<Uint8Array> {
  const { readFile, stat } = await import('node:fs/promises');
  const st = await stat(path).catch(() => undefined);
  if (!st?.isFile())
    failed(`${tool} wrote no ${path.split('/').pop()}`, `check the ${tool} log; the job failed`);
  if ((st?.size ?? 0) > maxBytes)
    failed(`${tool} output ${path} is ${st?.size} bytes, cap ${maxBytes}`, 'raise maxBytes');
  return new Uint8Array(await readFile(path));
}

/** sha256 of files concatenated in order (a task's scripts), read from disk. */
export async function filesSha256(paths: readonly string[], tool: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const parts: Uint8Array[] = [];
  for (const p of paths) {
    const b = await readFile(p).catch(() => undefined);
    if (!b)
      failed(`${tool} script ${p} is missing`, 'pass scriptsDir pointing at examples/blender');
    else parts.push(new Uint8Array(b));
  }
  const all = new Uint8Array(parts.reduce((s, b) => s + b.length, 0));
  let at = 0;
  for (const b of parts) {
    all.set(b, at);
    at += b.length;
  }
  return sha256Hex(all);
}
