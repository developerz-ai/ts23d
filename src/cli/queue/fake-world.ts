// Test fixture: a machine for the queue's tests. A temp $TS23D_HOME, a clock that only moves when
// a waiter sleeps, and processes that live and die on the test's say. Each `proc(pid)` is one
// pretend process with its own environment; nothing here waits on real time or real load.

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ts23dError } from '../../core/index.ts';
import type { QueueOptions } from './acquire.ts';
import type { QueueClass } from './config.ts';
import type { MutableEnv } from './held.ts';
import { type Lineup, lineup, liveTicket } from './lineup.ts';
import type { Proc } from './liveness.ts';

export interface FakeWorld {
  readonly home: string;
  /** Lines the queue printed (wait lines, warnings), every process together. */
  readonly lines: string[];
  /** Options for one pretend process; `env` adds to its environment. */
  proc(pid: number, env?: MutableEnv): QueueOptions & { readonly env: MutableEnv };
  /** The process exits (or is killed): its tickets no longer hold. */
  kill(pid: number): void;
  /** The pid is reused by a new process with another start time. */
  reuse(pid: number): void;
  /** How many waiters are asleep between polls. */
  sleeping(): number;
  /** Wake every sleeping waiter for one more poll. */
  wake(): void;
  /** Waiters stop sleeping: each poll moves the clock on at once (for timeouts). */
  freeRun(): void;
  now(): number;
  lineup(cls: QueueClass, capacity: number): Promise<Lineup>;
}

export const MACHINE = { host: 'box', boot: 'boot-1' } as const;

/** Let pending file work and promise turns run until `done()`; fails after a bounded number. */
export async function until(done: () => boolean | Promise<boolean>, what: string): Promise<void> {
  for (let i = 0; i < 5000; i++) {
    if (await done()) return;
    await new Promise<void>((r) => setImmediate(r));
  }
  throw new Ts23dError('T3D_ASSERT_INPUT', {
    cause: `the queue fixture waited 5000 turns and it never happened: ${what}`,
    fix: 'the waiter the test expects never slept, or the ticket files never changed: read the acquire loop',
  });
}

export async function fakeWorld(cores = 16): Promise<FakeWorld> {
  const home = await mkdtemp(join(tmpdir(), 't3d-queue-'));
  const starts = new Map<number, string>();
  const lines: string[] = [];
  let clock = Date.parse('2026-11-18T10:00:00Z');
  let sleepers: (() => void)[] = [];
  let free = false;
  const alive = async (p: Proc): Promise<boolean> => starts.get(p.pid) === p.start;
  return {
    home,
    lines,
    proc(pid, env = {}) {
      if (!starts.has(pid)) starts.set(pid, `start-${pid}`);
      return {
        env: { TS23D_HOME: home, ...env },
        cores,
        now: () => clock,
        sleep: (ms) => {
          clock += ms;
          return free ? Promise.resolve() : new Promise<void>((r) => sleepers.push(r));
        },
        alive,
        self: { pid, start: starts.get(pid) ?? '' },
        machine: MACHINE,
        log: (line) => lines.push(line),
        cmd: `job ${pid}`,
        cwd: `/work/${pid}`,
      };
    },
    kill: (pid) => {
      starts.delete(pid);
    },
    reuse: (pid) => {
      starts.set(pid, `restart-${pid}`);
    },
    sleeping: () => sleepers.length,
    wake: () => {
      const woken = sleepers;
      sleepers = [];
      for (const w of woken) w();
    },
    freeRun: () => {
      free = true;
    },
    now: () => clock,
    lineup: (cls, capacity) =>
      lineup(join(home, 'queue', cls), capacity, liveTicket(MACHINE, alive)),
  };
}
