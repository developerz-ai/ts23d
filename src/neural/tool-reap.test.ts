// Ctrl-C on t3d also ends the tools it started (tool-reap.ts): nodeExec spawns each tool in its own
// process group, so without the handler a SIGINT/SIGTERM left them running. A child Bun process
// starts a harmless `sleep` through nodeExec; we signal it and check both are gone. With a host
// SIGINT handler that keeps the process alive, every later SIGINT still reaps the tools.
// `onToolChild` listeners hear each tool's pid as it starts (the CLI queue lists it on its ticket).

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { onToolChild, trackChild } from './tool-reap.ts';

const spawnLib = join(import.meta.dir, 'tool-spawn.ts');
const START = `import { nodeExec } from ${JSON.stringify(spawnLib)};
const { execSync } = require('node:child_process');
const start = () => {
  void nodeExec('sleep', ['30'], { timeoutMs: 60_000, maxBytes: 1024 });
  setTimeout(() => {
    console.log(execSync('pgrep -n -P ' + process.pid + ' -x sleep').toString().trim());
  }, 200);
};
setInterval(() => {}, 1000);
`;
const SCRIPT = `${START}start();\n`;
/** The host survives SIGINT and starts a second tool after the first signal. */
const HOST = `${START}let started = 1;
process.on('SIGINT', () => { if (started++ < 2) setTimeout(start, 100); });
start();
`;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function gone(pid: number): Promise<boolean> {
  for (let i = 0; i < 40 && alive(pid); i++) await Bun.sleep(50);
  return !alive(pid);
}

/** Reads one whole line from the child's stdout, failing after 5 s. */
function lineReader(stream: ReadableStream<Uint8Array>): () => Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  return async () => {
    const deadline = Date.now() + 5000;
    while (!buf.includes('\n')) {
      const left = deadline - Date.now();
      const next = await Promise.race([
        reader.read(),
        Bun.sleep(Math.max(left, 0)).then(() => null),
      ]);
      if (next === null || next.done) throw new Error('no line from the child within 5 s');
      buf += dec.decode(next.value);
    }
    const at = buf.indexOf('\n');
    const line = buf.slice(0, at).trim();
    buf = buf.slice(at + 1);
    return line;
  };
}

/** Spawns `script`, runs `body` with its line reader and a list to record tool pids in, and
 *  always kills whatever it started, whether startup, an assertion or the body fails. */
async function withChild(
  script: string,
  body: (
    proc: Bun.Subprocess<'ignore', 'pipe', 'inherit'>,
    next: () => Promise<number>,
  ) => Promise<void>,
): Promise<void> {
  const proc = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe', stderr: 'inherit' });
  const tools: number[] = [];
  try {
    const line = lineReader(proc.stdout);
    const next = async (): Promise<number> => {
      const pid = Number(await line());
      expect(Number.isInteger(pid) && pid > 0).toBe(true);
      tools.push(pid);
      return pid;
    };
    await body(proc, next);
  } finally {
    // Tools the child started but has not reported yet are found by parent pid.
    const kids = Bun.spawnSync(['pgrep', '-P', String(proc.pid)])
      .stdout.toString()
      .split('\n');
    for (const pid of [...tools, ...kids.map(Number).filter((n) => n > 0)])
      if (alive(pid)) process.kill(pid, 'SIGKILL');
    proc.kill('SIGKILL');
  }
}

describe.skipIf(process.platform === 'win32')('nodeExec children and signals', () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    it(`${signal} kills the running tool's process group, then t3d dies of ${signal}`, () =>
      withChild(SCRIPT, async (proc, next) => {
        const pid = await next();
        expect(alive(pid)).toBe(true);
        proc.kill(signal);
        await proc.exited;
        expect(proc.signalCode).toBe(signal);
        expect(await gone(pid)).toBe(true);
      }));

  it('a host that survives SIGINT still has later tools reaped on the next SIGINT', () =>
    withChild(HOST, async (proc, next) => {
      for (let round = 0; round < 2; round++) {
        const pid = await next();
        expect(alive(pid)).toBe(true);
        proc.kill('SIGINT');
        expect(await gone(pid)).toBe(true);
        expect(proc.exitCode).toBeNull();
      }
    }));
});

describe('onToolChild', () => {
  it('a removed listener hears nothing more; a live one hears every tool as it starts', () => {
    const heard: number[] = [];
    const off = onToolChild((pid) => heard.push(pid));
    const untrack = [trackChild(4_000_001), trackChild(4_000_002)];
    off();
    untrack.push(trackChild(4_000_003));
    for (const u of untrack) u();
    expect(heard).toEqual([4_000_001, 4_000_002]);
  });
});
