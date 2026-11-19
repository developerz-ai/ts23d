// Real processes, the real liveness probe, a temp home. Several Bun children contend for the
// blender class (capacity 1): their start/end marks must alternate strictly, whatever the load
// (the test asserts order, never timing). And a holder that is SIGKILLed frees the class without
// any cleanup step.

import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquire } from './acquire.ts';

const CHILD = join(import.meta.dir, 'contend-child.ts');
const CHILDREN = 6;

const child = (home: string, ...args: string[]) =>
  Bun.spawn([process.execPath, CHILD, home, ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, T3D_QUEUE: 'wait', CI: '' },
  });

describe('real processes', () => {
  test('a killed holder blocks while it lives and frees the class once it is dead', async () => {
    const home = await mkdtemp(join(tmpdir(), 't3d-queue-kill-'));
    const env = { TS23D_HOME: home, T3D_QUEUE: 'fail' };
    const holder = child(home, 'hold');
    try {
      const first = await holder.stdout.getReader().read();
      expect(new TextDecoder().decode(first.value)).toContain('held');
      await expect(acquire('blender', 1, { env: { ...env } })).rejects.toThrow('T3D_QUEUE_BUSY');
    } finally {
      holder.kill('SIGKILL');
      await holder.exited;
    }
    const next = await acquire('blender', 1, { env: { ...env } });
    expect(next.queued).toBe(true);
    await next.release();
  }, 60_000);

  test(`${CHILDREN} processes at capacity 1 never overlap, and all of them run`, async () => {
    const home = await mkdtemp(join(tmpdir(), 't3d-queue-contend-'));
    const log = join(home, 'marks.log');
    const procs = Array.from({ length: CHILDREN }, (_, i) => child(home, 'work', log, String(i)));
    expect(await Promise.all(procs.map((p) => p.exited))).toEqual(procs.map(() => 0));
    const marks = (await readFile(log, 'utf8')).trim().split('\n');
    expect(marks).toHaveLength(CHILDREN * 2);
    for (let i = 0; i < marks.length; i += 2) {
      const [open, who] = (marks[i] ?? '').split(' ');
      expect(open).toBe('start');
      expect(marks[i + 1]).toBe(`end ${who}`);
    }
    expect(new Set(marks.filter((m) => m.startsWith('start'))).size).toBe(CHILDREN);
  }, 120_000);
});
