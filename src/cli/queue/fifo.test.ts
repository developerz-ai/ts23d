// Order and weights on a fake machine (fake-world.ts): capacity 1 never admits two, weighted CPU
// tokens, strict FIFO (a light job does not jump a waiting heavy one), clamping above capacity,
// grants passed down through the environment, and a claimant delayed past a tidy-up.

import { describe, expect, test } from 'bun:test';
import { acquire, type Grant } from './acquire.ts';
import { fakeWorld, until } from './fake-world.ts';
import { grantedCpu } from './held.ts';

/** Start an acquire and record when it is admitted. */
function start(order: string[], name: string, run: Promise<Grant>): Promise<Grant> {
  return run.then((g) => {
    order.push(name);
    return g;
  });
}

describe('order', () => {
  test('capacity 1 never runs two, and the waiters are admitted first come, first served', async () => {
    const w = await fakeWorld();
    const order: string[] = [];
    const a = await acquire('blender', 1, w.proc(100));
    const b = start(order, 'b', acquire('blender', 1, w.proc(200)));
    await until(() => w.sleeping() === 1, 'b waits');
    const c = start(order, 'c', acquire('blender', 1, w.proc(300)));
    await until(() => w.sleeping() === 2, 'c waits');
    // However often they poll, nobody gets in while a holds.
    for (let i = 0; i < 3; i++) {
      w.wake();
      await until(() => w.sleeping() === 2, 'both wait again');
    }
    expect(order).toEqual([]);
    expect((await w.lineup('blender', 1)).inUse).toBe(1);
    await a.release();
    w.wake();
    const granted = await b;
    await until(() => w.sleeping() === 1, 'c still waits behind b');
    expect(order).toEqual(['b']);
    await granted.release();
    w.wake();
    await (await c).release();
    expect(order).toEqual(['b', 'c']);
    expect(w.lines.filter((l) => l.includes('running after'))).toHaveLength(2);
  });

  test('strict FIFO: a 1 behind a waiting 8 does not jump it, though it would fit', async () => {
    const w = await fakeWorld(); // 16 cores: cpu capacity 12
    const order: string[] = [];
    const first = await acquire('cpu', 8, w.proc(100));
    const heavy = start(order, 'heavy', acquire('cpu', 8, w.proc(200)));
    await until(() => w.sleeping() === 1, 'the second 8 waits');
    const light = start(order, 'light', acquire('cpu', 1, w.proc(300)));
    await until(() => w.sleeping() === 2, 'the 1 waits behind it');
    expect(order).toEqual([]);
    expect(w.lines.at(-1)).toContain('waiting for cpu (need 1 of 12) · position 3 of 3');
    await first.release();
    w.wake();
    await Promise.all([heavy, light]);
    // Both fit now (8 + 1 of 12) and are admitted by the same wake: which returns first is not
    // an order the queue keeps. The FIFO claim is the empty `order` above.
    expect([...order].sort()).toEqual(['heavy', 'light']);
    expect((await w.lineup('cpu', 12)).inUse).toBe(9);
  });

  test('a claimant delayed past a tidy-up cannot land below the top', async () => {
    const w = await fakeWorld();
    const x = await acquire('blender', 1, w.proc(100));
    let letGo = (): void => {};
    const paused = new Promise<void>((r) => {
      letGo = r;
    });
    let reached = false;
    let pauses = 0;
    // The delayed one has read "top is 1" and stops just before claiming 2.
    const delayed = acquire('blender', 1, {
      ...w.proc(400, { T3D_QUEUE: 'fail' }),
      beforeClaim: async () => {
        if (pauses++ > 0) return;
        reached = true;
        await paused;
      },
    });
    await until(() => reached, 'the delayed claimant read the top');
    const order: string[] = [];
    const y = start(order, 'y', acquire('blender', 1, w.proc(200)));
    await until(() => w.sleeping() === 1, 'y waits at 2');
    const z = start(order, 'z', acquire('blender', 1, w.proc(300)));
    await until(() => w.sleeping() === 2, 'z waits at 3');
    await x.release();
    w.wake();
    await (await y).release(); // 1 and 2 are tidied: 2 is free again, below the top (3)
    w.wake();
    const running = await z;
    expect((await w.lineup('blender', 1)).entries.map((e) => e.seq)).toEqual([3]);
    letGo();
    // Landing on 2 would put it ahead of the running 3: two at once. It must leave that number
    // (it pauses before claiming again) and go behind instead.
    await until(() => w.sleeping() === 1, 'the delayed claimant backs off');
    expect((await w.lineup('blender', 1)).entries.map((e) => e.seq)).toEqual([3]);
    w.wake();
    await expect(delayed).rejects.toThrow('T3D_QUEUE_BUSY');
    expect((await w.lineup('blender', 1)).live.map((s) => s.seq)).toEqual([3]);
    await running.release();
  });
});

describe('weights', () => {
  test('8 + 4 fill 12 tokens, the next 1 waits until one of them leaves', async () => {
    const w = await fakeWorld();
    const eight = await acquire('cpu', 8, w.proc(100));
    const four = await acquire('cpu', 4, w.proc(200));
    expect([eight.queued, four.queued, eight.weight, four.weight]).toEqual([true, true, 8, 4]);
    const order: string[] = [];
    const one = start(order, 'one', acquire('cpu', 1, w.proc(300)));
    await until(() => w.sleeping() === 1, 'the 1 waits');
    expect((await w.lineup('cpu', 12)).inUse).toBe(12);
    expect(order).toEqual([]);
    await four.release();
    w.wake();
    await one;
    expect((await w.lineup('cpu', 12)).inUse).toBe(9);
  });

  test('a request above the capacity is clamped to it and runs alone', async () => {
    const w = await fakeWorld();
    const all = await acquire('cpu', Number.POSITIVE_INFINITY, w.proc(100));
    expect(all.weight).toBe(12);
    await expect(acquire('cpu', 1, w.proc(200, { T3D_QUEUE: 'fail' }))).rejects.toThrow(
      'cpu is full (12 of 12 in use',
    );
    await all.release();
    expect((await acquire('cpu', 99, w.proc(300))).weight).toBe(12);
  });
});

describe('grants passed down', () => {
  test('the same class passes through at no more than what is held; nothing new is queued', async () => {
    const w = await fakeWorld();
    const parent = w.proc(100);
    const held = await acquire('cpu', 4, parent);
    expect(grantedCpu(parent.env)).toBe(4);
    // A child process: its own pid, the parent's environment.
    const child = { ...w.proc(101), env: { ...parent.env } };
    const inner = await acquire('cpu', 8, child);
    expect([inner.queued, inner.weight]).toEqual([false, 4]);
    expect((await w.lineup('cpu', 12)).live).toHaveLength(1);
    await inner.release();
    expect((await w.lineup('cpu', 12)).inUse).toBe(4);
    await held.release();
  });

  test('never waits downward, takes one higher class, and a dead parent’s token grants nothing', async () => {
    const w = await fakeWorld();
    const p = w.proc(100);
    const cpu = await acquire('cpu', 1, p);
    const blender = await acquire('blender', 1, p);
    expect(blender.queued).toBe(true);
    await cpu.release();
    // Holding blender only: cpu is below it, so it passes through even with cpu full.
    await acquire('cpu', 12, w.proc(500));
    const down = await acquire('cpu', 1, p);
    expect(down.queued).toBe(false);
    const orphan = { ...w.proc(101, { T3D_QUEUE: 'fail' }), env: { ...p.env, T3D_QUEUE: 'fail' } };
    w.kill(100);
    await expect(acquire('cpu', 1, orphan)).rejects.toThrow('T3D_QUEUE_BUSY');
    expect((await acquire('blender', 1, orphan)).queued).toBe(true);
  });
});
