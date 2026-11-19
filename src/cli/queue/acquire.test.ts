// The queue's modes and its failure paths, on a fake machine (fake-world.ts): refusal when busy,
// timeout, off and CI bypass, a queue that cannot be written, dead owners, reused pids, tickets
// from another boot or host, and release on return and on throw.

import { describe, expect, test } from 'bun:test';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isTs23dError } from '../../core/index.ts';
import { nodeExec } from '../../neural/index.ts';
import { acquire, withQueue } from './acquire.ts';
import { fakeWorld, until } from './fake-world.ts';

const coded = async (
  run: Promise<unknown>,
): Promise<{ code: string; message: string; fix: string }> => {
  try {
    await run;
  } catch (e) {
    if (isTs23dError(e)) return e.toJSON();
    throw e;
  }
  throw new Error('expected a coded error, the call succeeded');
};

describe('acquire: refusals', () => {
  test('fail mode: a full class is T3D_QUEUE_BUSY naming the holder, and leaves no ticket', async () => {
    const w = await fakeWorld();
    await acquire('blender', 1, w.proc(100));
    const e = await coded(acquire('blender', 1, w.proc(200, { T3D_QUEUE: 'fail' })));
    expect(e.code).toBe('T3D_QUEUE_BUSY');
    expect(e.message).toContain('blender is full (1 of 1 in use, 0 waiting): pid 100 "job 100"');
    expect(e.message).toContain('/work/100');
    expect(e.fix).toContain('t3d queue status');
    expect((await w.lineup('blender', 1)).live.map((s) => s.ticket.procs[0]?.pid)).toEqual([100]);
  });

  test('a wait past the limit is T3D_QUEUE_TIMEOUT naming who is ahead, and leaves no ticket', async () => {
    const w = await fakeWorld();
    await acquire('gpu', 1, w.proc(100));
    w.freeRun();
    const e = await coded(acquire('gpu', 1, w.proc(200, { T3D_QUEUE_MAX_WAIT: '5' })));
    expect(e.code).toBe('T3D_QUEUE_TIMEOUT');
    expect(e.message).toMatch(
      /waited \d+s for gpu \(need 1 of 1\), still position 2 behind pid 100/,
    );
    expect(e.fix).toContain('t3d queue clear --pid 100');
    expect(e.fix).toContain('T3D_QUEUE_MAX_WAIT');
    expect((await w.lineup('gpu', 1)).live).toHaveLength(1);
    // The wait line went to the log before the timeout.
    expect(w.lines[0]).toContain('t3d queue: waiting for gpu (need 1 of 1) · position 2 of 2');
  });

  test('a T3D_QUEUE value that is not a mode is a usage error', async () => {
    const w = await fakeWorld();
    const e = await coded(acquire('cpu', 1, w.proc(100, { T3D_QUEUE: 'maybe' })));
    expect(e.code).toBe('T3D_CLI_USAGE');
    expect(e.fix).toContain('wait');
  });
});

describe('acquire: bypass and fail-open', () => {
  test('off, and CI, take nothing and touch no file; an explicit mode beats CI', async () => {
    const w = await fakeWorld();
    for (const env of [{ T3D_QUEUE: 'off' }, { CI: 'true' }]) {
      const a = await acquire('blender', 1, w.proc(100, env));
      const b = await acquire('blender', 1, w.proc(200, env));
      expect([a.queued, b.queued]).toEqual([false, false]);
      await a.release();
    }
    expect(await readdir(w.home)).toEqual([]);
    const on = await acquire('blender', 1, w.proc(300, { CI: 'true', T3D_QUEUE: 'wait' }));
    expect(on.queued).toBe(true);
  });

  test('a queue folder that cannot be made: one warning with a fix, then unqueued', async () => {
    const w = await fakeWorld();
    await writeFile(join(w.home, 'queue'), 'not a folder');
    const a = await acquire('cpu', 1, w.proc(100));
    const b = await acquire('cpu', 1, w.proc(200));
    expect([a.queued, b.queued]).toEqual([false, false]);
    expect(w.lines).toHaveLength(1);
    expect(w.lines[0]).toContain('running unqueued');
    expect(w.lines[0]).toContain('fix:');
  });
});

describe('acquire: owners that are gone', () => {
  test('a live holder blocks; once its process is dead the next is admitted and the file tidied', async () => {
    const w = await fakeWorld();
    await acquire('blender', 1, w.proc(100));
    const waiting = acquire('blender', 1, w.proc(200));
    await until(() => w.sleeping() === 1, 'the second waits');
    w.kill(100);
    w.wake();
    expect((await waiting).queued).toBe(true);
    expect(await readdir(join(w.home, 'queue', 'blender'))).toEqual(['000000000002.json']);
  });

  test('a reused pid (same number, another start time) does not hold the ticket', async () => {
    const w = await fakeWorld();
    await acquire('blender', 1, w.proc(100));
    w.reuse(100);
    const next = await acquire('blender', 1, w.proc(200, { T3D_QUEUE: 'fail' }));
    expect(next.queued).toBe(true);
  });

  test('tickets from another boot or another host hold nothing', async () => {
    const w = await fakeWorld();
    await acquire('gpu', 1, { ...w.proc(100), machine: { host: 'box', boot: 'boot-0' } });
    await acquire('gpu', 1, { ...w.proc(101), machine: { host: 'other', boot: 'boot-1' } });
    const next = await acquire('gpu', 1, w.proc(200, { T3D_QUEUE: 'fail' }));
    expect(next.queued).toBe(true);
    expect((await w.lineup('gpu', 1)).stale).toHaveLength(0);
  });
});

describe('release', () => {
  test('a throwing task still releases, and the error comes through', async () => {
    const w = await fakeWorld();
    const boom = withQueue(
      'blender',
      1,
      async () => {
        throw new Error('task failed');
      },
      w.proc(100),
    );
    await expect(boom).rejects.toThrow('task failed');
    expect((await w.lineup('blender', 1)).live).toHaveLength(0);
  });

  test('a returning task releases; the top file stays as a released marker; the grant leaves the env', async () => {
    const w = await fakeWorld();
    const p = w.proc(100);
    const seen = await withQueue(
      'blender',
      1,
      async (g) => {
        expect(p.env['T3D_QUEUE_TOKEN']).toMatch(/^blender:1:1:[0-9a-f]{32}$/);
        expect((await w.lineup('blender', 1)).inUse).toBe(1);
        return g?.queued;
      },
      p,
    );
    expect(seen).toBe(true);
    expect(p.env['T3D_QUEUE_TOKEN']).toBeUndefined();
    const l = await w.lineup('blender', 1);
    expect(l.live).toHaveLength(0);
    expect(l.entries.map((e) => e.seq)).toEqual([1]);
    expect((await acquire('blender', 1, w.proc(200, { T3D_QUEUE: 'fail' }))).queued).toBe(true);
  });

  test('a tool the task starts is listed on the ticket, so the place outlives the owner', async () => {
    const w = await fakeWorld();
    const procs = await withQueue(
      'blender',
      1,
      async () => {
        await nodeExec('true', [], { timeoutMs: 10_000, maxBytes: 1024 });
        const listed = async () => (await w.lineup('blender', 1)).live[0]?.ticket.procs ?? [];
        await until(async () => (await listed()).length === 2, 'the tool is on the ticket');
        return listed();
      },
      w.proc(100),
    );
    expect(procs[0]).toEqual({ pid: 100, start: 'start-100' });
    expect(procs[1]?.pid).toBeGreaterThan(1);
  });

  test('release twice is one release', async () => {
    const w = await fakeWorld();
    const a = await acquire('blender', 1, w.proc(100));
    await a.release();
    const b = await acquire('blender', 1, w.proc(200));
    await a.release();
    expect((await w.lineup('blender', 1)).live.map((s) => s.seq)).toEqual([2]);
    await b.release();
  });
});
