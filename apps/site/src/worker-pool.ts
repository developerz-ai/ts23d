// A small pool of compile workers. Each ask goes to the worker with the fewest jobs in flight, so a
// 20-second sculpt compile never blocks a catalog answer, a trim sheet or a light asset. A job
// nobody waits for any more can be cancelled: its worker is terminated and replaced (compiles are
// synchronous inside a worker, so termination is the only way to stop one). A worker that crashes
// (`error`, `messageerror`) rejects every job it held with the recipe's name and is respawned once;
// a second crash leaves its slot dead, and with every slot dead asks reject at once, so the page
// always ends in an asset or a message, never an endless progress bar.

import type { Answer, Ask, WorkerIn, WorkerOut } from './compile-protocol.ts';

/** What the pool needs of a worker; a real `Worker` fits, tests pass a fake. */
export interface PoolWorker extends EventTarget {
  postMessage(msg: WorkerIn): void;
  terminate(): void;
}

interface Job {
  readonly id: number;
  /** What the job compiles, for the error a crash rejects it with. */
  readonly label: string;
  resolve(r: Answer): void;
  reject(e: Error): void;
}

interface Slot {
  worker: PoolWorker;
  readonly jobs: Map<number, Job>;
  crashes: number;
  dead: boolean;
}

export class CancelledError extends Error {
  constructor() {
    super('compile cancelled');
    this.name = 'CancelledError';
  }
}

/** A compile worker died under the job (or none is left to run it). */
export class WorkerCrashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerCrashError';
  }
}

/** Crashes a slot survives by respawning; the next one leaves it dead. */
const RESPAWNS = 1;

const spawnCompileWorker = (): PoolWorker =>
  new Worker(new URL('./compile.worker.ts', import.meta.url), { type: 'module' });

/** Two workers, three on machines with eight or more cores. */
export const poolSize = (): number => ((navigator.hardwareConcurrency || 4) >= 8 ? 3 : 2);

/** What an ask is about, in words: the recipe or asset name, or the shared job it runs. */
export const labelOf = (body: Ask): string => {
  if ('request' in body) return body.request.target.name;
  if ('manifest' in body) return body.manifest;
  if ('list' in body) return 'the recipe catalog';
  return 'the trim sheet';
};

/** Why a worker failed, from its `error` / `messageerror` event. */
const reasonOf = (e: Event): string => {
  if (e.type === 'messageerror') return 'its answer could not be read';
  const message = 'message' in e && typeof e.message === 'string' ? e.message : '';
  return message || 'the worker script failed to load or threw';
};

export class WorkerPool {
  private readonly slots: Slot[] = [];
  private nextId = 1;

  constructor(
    private readonly size = poolSize(),
    private readonly spawn: () => PoolWorker = spawnCompileWorker,
  ) {}

  private attach(slot: Slot): void {
    const worker = slot.worker;
    worker.addEventListener('message', (e) => {
      if (slot.worker !== worker || !(e instanceof MessageEvent)) return;
      const data: WorkerOut = e.data;
      const job = slot.jobs.get(data.id);
      if (!job) return;
      slot.jobs.delete(data.id);
      if (data.ok) job.resolve(data.answer);
      else job.reject(new Error(data.error));
    });
    const crashed = (e: Event): void => {
      if (slot.worker === worker) this.crash(slot, reasonOf(e));
    };
    worker.addEventListener('error', crashed);
    worker.addEventListener('messageerror', crashed);
  }

  /** Reject the slot's jobs by name, then respawn its worker once; after that the slot is dead. */
  private crash(slot: Slot, reason: string): void {
    slot.worker.terminate();
    slot.crashes += 1;
    slot.dead = slot.crashes > RESPAWNS;
    const jobs = [...slot.jobs.values()];
    slot.jobs.clear();
    for (const job of jobs)
      job.reject(
        new WorkerCrashError(`compile worker crashed while compiling ${job.label}: ${reason}`),
      );
    if (slot.dead) return;
    slot.worker = this.spawn();
    this.attach(slot);
  }

  /** The idlest live worker, spawning lazily up to `size`; null when every slot is dead. */
  private pick(): Slot | null {
    const live = this.slots.filter((s) => !s.dead);
    const idle = live.find((s) => s.jobs.size === 0);
    if (idle) return idle;
    if (this.slots.length < this.size) {
      const slot: Slot = { worker: this.spawn(), jobs: new Map(), crashes: 0, dead: false };
      this.attach(slot);
      this.slots.push(slot);
      return slot;
    }
    return live.reduce<Slot | null>((a, b) => (a && a.jobs.size <= b.jobs.size ? a : b), null);
  }

  ask(body: Ask): { readonly id: number; readonly answer: Promise<Answer> } {
    const id = this.nextId++;
    const label = labelOf(body);
    const slot = this.pick();
    if (!slot) {
      const why = `no compile worker left to compile ${label}: every worker crashed twice`;
      return { id, answer: Promise.reject(new WorkerCrashError(why)) };
    }
    const answer = new Promise<Answer>((resolve, reject) => {
      slot.jobs.set(id, { id, label, resolve, reject });
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
    const jobs = [...slot.jobs.values()];
    slot.jobs.clear();
    for (const job of jobs) job.reject(new CancelledError());
    slot.worker = this.spawn();
    this.attach(slot);
    return true;
  }

  /** Jobs in flight across the pool. */
  get busy(): number {
    return this.slots.reduce((n, s) => n + s.jobs.size, 0);
  }
}
