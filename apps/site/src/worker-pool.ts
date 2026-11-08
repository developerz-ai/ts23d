// A small pool of compile workers. Each ask goes to the worker with the fewest jobs in flight, so a
// 20-second sculpt compile never blocks a catalog answer, a trim sheet or a light asset. A job
// nobody waits for any more can be cancelled: its worker is terminated and replaced (compiles are
// synchronous inside a worker, so termination is the only way to stop one).

import type { Answer, Ask, WorkerIn, WorkerOut } from './compile-protocol.ts';

interface Job {
  readonly id: number;
  resolve(r: Answer): void;
  reject(e: Error): void;
}

interface Slot {
  worker: Worker;
  readonly jobs: Map<number, Job>;
}

export class CancelledError extends Error {
  constructor() {
    super('compile cancelled');
    this.name = 'CancelledError';
  }
}

const spawn = (): Worker =>
  new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });

/** Two workers, three on machines with eight or more cores. */
export const poolSize = (): number => ((navigator.hardwareConcurrency || 4) >= 8 ? 3 : 2);

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private nextId = 1;

  constructor(private readonly size = poolSize()) {}

  private attach(slot: Slot): void {
    slot.worker.addEventListener('message', (e: MessageEvent<WorkerOut>) => {
      const job = slot.jobs.get(e.data.id);
      if (!job) return;
      slot.jobs.delete(e.data.id);
      if (e.data.ok) job.resolve(e.data.answer);
      else job.reject(new Error(e.data.error));
    });
  }

  /** The idlest worker, spawning lazily up to `size`. */
  private pick(): Slot {
    const idle = this.slots.find((s) => s.jobs.size === 0);
    if (idle) return idle;
    if (this.slots.length < this.size) {
      const slot: Slot = { worker: spawn(), jobs: new Map() };
      this.attach(slot);
      this.slots.push(slot);
      return slot;
    }
    return this.slots.reduce((a, b) => (b.jobs.size < a.jobs.size ? b : a));
  }

  ask(body: Ask): { readonly id: number; readonly answer: Promise<Answer> } {
    const id = this.nextId++;
    const slot = this.pick();
    const answer = new Promise<Answer>((resolve, reject) => {
      slot.jobs.set(id, { id, resolve, reject });
      const msg: WorkerIn = { id, ...body };
      slot.worker.postMessage(msg);
    });
    return { id, answer };
  }

  /**
   * Stop job `id` if it is still running: terminate its worker and reject every job queued on it
   * (callers drop their caches on rejection, so asking again recompiles). False when done already.
   */
  cancel(id: number): boolean {
    const slot = this.slots.find((s) => s.jobs.has(id));
    if (!slot) return false;
    slot.worker.terminate();
    for (const job of slot.jobs.values()) job.reject(new CancelledError());
    slot.jobs.clear();
    slot.worker = spawn();
    this.attach(slot);
    return true;
  }

  /** Jobs in flight across the pool. */
  get busy(): number {
    return this.slots.reduce((n, s) => n + s.jobs.size, 0);
  }
}
