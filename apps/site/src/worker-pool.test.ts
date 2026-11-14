import { describe, expect, test } from 'bun:test';
import type { Ask, WorkerIn, WorkerOut } from './compile-protocol.ts';
import {
  CancelledError,
  labelOf,
  type PoolWorker,
  WorkerCrashError,
  WorkerPool,
} from './worker-pool.ts';

/** A worker that records what it was sent and fires events on demand. */
class FakeWorker extends EventTarget implements PoolWorker {
  readonly sent: WorkerIn[] = [];
  terminated = false;
  postMessage(msg: WorkerIn): void {
    this.sent.push(msg);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(data: WorkerOut): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
  crash(type: 'error' | 'messageerror' = 'error'): void {
    this.dispatchEvent(new Event(type));
  }
}

const tiger: Ask = { request: { target: { kind: 'recipe', name: 'tiger_1' }, lod: 0 } };
const dragon: Ask = { request: { target: { kind: 'recipe', name: 'dragon' }, lod: 1 } };

/** A one-slot pool and every worker it spawned, in order. */
function onePool(): { pool: WorkerPool; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(1, () => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { pool, workers };
}

const last = (workers: readonly FakeWorker[]): FakeWorker => {
  const w = workers.at(-1);
  if (!w) throw new Error('no worker spawned');
  return w;
};

describe('WorkerPool crash handling', () => {
  test('a worker error rejects the pending job with the recipe name and stops it being busy', async () => {
    const { pool, workers } = onePool();
    const { answer } = pool.ask(tiger);
    last(workers).crash();
    const error = await answer.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkerCrashError);
    expect(String(error)).toContain('tiger_1');
    expect(pool.busy).toBe(0);
  });

  test('every job queued on the crashed worker rejects, each with its own name', async () => {
    const { pool, workers } = onePool();
    const a = pool.ask(tiger).answer.catch((e: unknown) => String(e));
    const b = pool.ask(dragon).answer.catch((e: unknown) => String(e));
    last(workers).crash('messageerror');
    expect(await a).toContain('tiger_1');
    expect(await b).toContain('dragon');
    expect(await b).toContain('could not be read');
  });

  test('after one crash the next job runs on a respawned worker', async () => {
    const { pool, workers } = onePool();
    void pool.ask(tiger).answer.catch(() => null);
    const first = last(workers);
    first.crash();
    expect(first.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const { id, answer } = pool.ask(dragon);
    const fresh = last(workers);
    expect(fresh.sent.map((m) => m.id)).toEqual([id]);
    fresh.reply({ id, ok: true, answer: [] });
    expect(await answer).toEqual([]);
    // A late event from the terminated worker changes nothing.
    first.crash();
    expect(workers).toHaveLength(2);
  });

  test('a second crash leaves the slot dead and later jobs reject at once', async () => {
    const { pool, workers } = onePool();
    void pool.ask(tiger).answer.catch(() => null);
    last(workers).crash();
    void pool.ask(tiger).answer.catch(() => null);
    last(workers).crash();
    expect(workers).toHaveLength(2);
    const error = await pool.ask(dragon).answer.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WorkerCrashError);
    expect(String(error)).toContain('dragon');
    expect(workers).toHaveLength(2);
  });

  test('with one slot dead, jobs go to the live one', async () => {
    const workers: FakeWorker[] = [];
    const pool = new WorkerPool(2, () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    void pool.ask(tiger).answer.catch(() => null);
    last(workers).crash();
    void pool.ask(tiger).answer.catch(() => null);
    last(workers).crash();
    const { id, answer } = pool.ask(dragon);
    const live = last(workers);
    expect(workers).toHaveLength(3);
    live.reply({ id, ok: true, answer: [] });
    expect(await answer).toEqual([]);
  });
});

describe('WorkerPool basics', () => {
  test('a failed compile rejects with the worker error, the worker lives on', async () => {
    const { pool, workers } = onePool();
    const { id, answer } = pool.ask(tiger);
    last(workers).reply({ id, ok: false, error: 'T3D_BUDGET: over budget' });
    expect(String(await answer.catch((e: unknown) => e))).toContain('T3D_BUDGET');
    expect(workers).toHaveLength(1);
  });

  test('cancel rejects with CancelledError and respawns', async () => {
    const { pool, workers } = onePool();
    const { id, answer } = pool.ask(tiger);
    expect(pool.cancel(id)).toBe(true);
    expect(await answer.catch((e: unknown) => e)).toBeInstanceOf(CancelledError);
    expect(workers).toHaveLength(2);
    expect(pool.cancel(id)).toBe(false);
  });

  test('labelOf names the recipe, the manifest or the shared job', () => {
    expect(labelOf(tiger)).toBe('tiger_1');
    expect(labelOf({ manifest: 'dragon' })).toBe('dragon');
    expect(labelOf({ list: true })).toBe('the recipe catalog');
    expect(labelOf({ sheet: true })).toBe('the trim sheet');
  });
});
