// `t3d queue …` and the queue around every command, through `run()` with a temp $TS23D_HOME:
// --no-wait refusal, a waiting --json run that still prints one envelope, status, clear, and
// `queue run` / `hold` returning the command's own exit code.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../run.ts';
import { acquire } from './acquire.ts';
import type { QueueStatus } from './status.ts';

const KEYS = ['TS23D_HOME', 'T3D_QUEUE', 'T3D_QUEUE_MAX_WAIT', 'CI', 'T3D_QUEUE_TOKEN'] as const;
const saved = new Map<string, string | undefined>();
let home = '';

beforeAll(async () => {
  for (const k of KEYS) saved.set(k, process.env[k]);
  for (const k of KEYS) delete process.env[k];
  home = await mkdtemp(join(tmpdir(), 't3d-queue-cmd-'));
  process.env['TS23D_HOME'] = home;
  process.env['T3D_QUEUE'] = 'wait';
});

afterAll(() => {
  for (const [k, v] of saved)
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
});

interface Envelope {
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: { readonly code: string; readonly message: string; readonly fix: string };
}

/** Run `t3d …` in-process; stdout lines and stderr lines apart. `onError` sees each stderr line. */
async function t3d(argv: readonly string[], onError: (line: string) => void = () => {}) {
  const { log, error } = console;
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...parts: unknown[]) => void out.push(parts.map(String).join(' '));
  console.error = (...parts: unknown[]) => {
    err.push(parts.map(String).join(' '));
    onError(err.at(-1) ?? '');
  };
  try {
    return { code: await run(argv), out, err };
  } finally {
    Object.assign(console, { log, error });
  }
}

/** Someone else on the machine: holds a class without this process's environment knowing. */
const other = (cls: 'cpu' | 'blender', weight: number, pid?: number) =>
  acquire(cls, weight, {
    env: { TS23D_HOME: home },
    cmd: 't3d hero wolf.ts --quality path',
    // A given pid is a process that has since died: admitted here, stale to everyone after.
    ...(pid === undefined ? {} : { self: { pid, start: 'never' }, alive: async () => true }),
  });

const status = async (): Promise<QueueStatus> => {
  const r = await t3d(['queue', 'status', '--json']);
  expect(r.out).toHaveLength(1);
  const env = JSON.parse(r.out[0] ?? '') as Envelope;
  expect(env.ok).toBe(true);
  return env.data as QueueStatus;
};

describe('a queued command', () => {
  test('--no-wait on a full machine: one ok:false envelope with T3D_QUEUE_BUSY, exit 1', async () => {
    const holder = await other('cpu', Number.POSITIVE_INFINITY);
    try {
      const r = await t3d(['shot', 'no-such-recipe.ts', '--no-wait', '--json']);
      expect(r.code).toBe(1);
      expect(r.out).toHaveLength(1);
      const env = JSON.parse(r.out[0] ?? '') as Envelope;
      expect(env.ok).toBe(false);
      expect(env.error?.code).toBe('T3D_QUEUE_BUSY');
      expect(env.error?.message).toContain('"t3d hero wolf.ts --quality path"');
      expect(env.error?.fix).toContain('t3d queue status');
      // The flag does not outlive the run.
      expect(process.env['T3D_QUEUE']).toBe('wait');
    } finally {
      await holder.release();
    }
  });

  test('a --json run that waits prints the wait line on stderr and exactly one envelope on stdout', async () => {
    const holder = await other('cpu', Number.POSITIVE_INFINITY);
    const r = await t3d(['shot', 'no-such-recipe.ts', '--json'], (line) => {
      if (line.includes('waiting for cpu')) void holder.release();
    });
    expect(r.err.some((l) => l.includes('t3d queue: waiting for cpu (need 1 of'))).toBe(true);
    expect(r.err.some((l) => l.includes('t3d queue: running after'))).toBe(true);
    expect(r.out).toHaveLength(1);
    const env = JSON.parse(r.out[0] ?? '') as Envelope;
    // It got its turn and then ran: the recipe does not exist.
    expect(env.error?.code).toBe('T3D_RECIPE_NOT_FOUND');
    expect((await status()).classes.cpu.inUse).toBe(0);
  }, 30_000);

  test('a line the command refuses does not queue first: usage error at once on a full machine', async () => {
    const holder = await other('cpu', Number.POSITIVE_INFINITY);
    try {
      const r = await t3d(['build', '--nope', '--json']);
      expect(r.code).toBe(2);
      expect((JSON.parse(r.out[0] ?? '') as Envelope).error?.code).toBe('T3D_CLI_USAGE');
      expect(r.err).toEqual([]);
    } finally {
      await holder.release();
    }
  });
});

describe('t3d queue', () => {
  test('a bad subcommand or flag is T3D_CLI_USAGE, exit 2', async () => {
    for (const argv of [
      ['queue'],
      ['queue', 'clear'],
      ['queue', 'run', '--cpu', 'x', '--', 'true'],
      ['queue', 'hold'],
    ]) {
      const r = await t3d([...argv, '--json']);
      expect(r.code).toBe(2);
      expect((JSON.parse(r.out[0] ?? '') as Envelope).error?.code).toBe('T3D_CLI_USAGE');
    }
  });

  test('status --json: classes with capacity, use and ordered tickets; clear drops by kind', async () => {
    const running = await other('blender', 1);
    const dead = await other('cpu', 2, 2 ** 22 + 7);
    const s = await status();
    expect(s.mode).toBe('wait');
    expect(s.dir).toBe(join(home, 'queue'));
    expect(s.classes.blender).toMatchObject({ capacity: 1, inUse: 1 });
    expect(s.classes.blender.tickets.at(-1)).toMatchObject({
      state: 'running',
      weight: 1,
      pid: process.pid,
      cmd: 't3d hero wolf.ts --quality path',
      cwd: process.cwd(),
    });
    expect(s.classes.cpu.inUse).toBe(0);
    expect(s.classes.cpu.tickets.map((t) => t.state)).toEqual(['stale']);
    expect(s.classes.gpu.tickets).toEqual([]);
    expect(Array.isArray(s.loadAverage)).toBe(true);
    const stale = await t3d(['queue', 'clear', '--stale', '--json']);
    expect(JSON.parse(stale.out[0] ?? '')).toEqual({
      ok: true,
      data: { dropped: 1, processesEnded: 0 },
    });
    expect((await status()).classes.cpu.tickets).toEqual([]);
    const byPid = await t3d(['queue', 'clear', '--pid', String(process.pid)]);
    expect(byPid.out).toEqual(['dropped 1 ticket(s); no process was ended']);
    expect((await status()).classes.blender.inUse).toBe(0);
    await running.release();
    await dead.release();
    await other('blender', 1);
    expect((await t3d(['queue', 'clear', '--all'])).out[0]).toContain('dropped 1 ticket');
    const human = await t3d(['queue', 'status']);
    expect(human.out.join('\n')).toContain('blender  0 of 1 in use');
  });

  test('run and hold return the command’s exit code, and the command inherits the grant', async () => {
    expect((await t3d(['queue', 'run', '--', 'sh', '-c', 'exit 7'])).code).toBe(7);
    const token = 'case "$T3D_QUEUE_TOKEN" in cpu:3:*,blender:1:*) exit 0;; *) exit 9;; esac';
    expect(
      (await t3d(['queue', 'run', '--cpu', '3', '--blender', '--', 'sh', '-c', token])).code,
    ).toBe(0);
    expect((await t3d(['queue', 'hold', '--', 'sh', '-c', 'kill -TERM $$'])).code).toBe(143);
    expect(process.env['T3D_QUEUE_TOKEN']).toBeUndefined();
    const s = await status();
    expect([s.classes.cpu.inUse, s.classes.blender.inUse]).toEqual([0, 0]);
  });
});
