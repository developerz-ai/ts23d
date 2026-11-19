// Take a place in a machine-wide queue class and wait for the turn. `acquire(class, weight)`
// writes a ticket, polls until the live tickets before it leave room, and returns a grant whose
// `release()` marks the ticket done. No daemon and no signal handler: a killed owner is seen as
// dead by the next poll of whoever waits. A queue that cannot be read or written never blocks
// work: one warning, then the command runs unqueued. Modes: wait (default), fail
// (T3D_QUEUE_BUSY at once), off (no file is touched). Too long a wait is T3D_QUEUE_TIMEOUT.

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isTs23dError } from '../../core/index.ts';
import { onToolChild } from '../../neural/index.ts';
import { CLASSES, loadConfig, type QueueClass, type QueueConfig } from './config.ts';
import { addHeld, liveHeld, type MutableEnv, removeHeld } from './held.ts';
import { type Alive, lineup, liveTicket } from './lineup.ts';
import { type Machine, type Proc, procAlive, procOf, thisMachine } from './liveness.ts';
import {
  addTicketProc,
  claimTicket,
  listTickets,
  releaseTicket,
  type Ticket,
  tidy,
} from './tickets.ts';
import { age, busy, timedOut, type Waiting, waitKey, waitLine } from './wait-line.ts';

/** Everything the queue reads from the world; tests pass a temp home and a fake clock. */
export interface QueueOptions {
  readonly env?: MutableEnv;
  readonly cores?: number;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly alive?: Alive;
  readonly self?: Proc;
  readonly machine?: Machine;
  readonly log?: (line: string) => void;
  readonly cmd?: string;
  readonly cwd?: string;
  readonly beforeClaim?: () => Promise<void>;
}

export interface Grant {
  readonly cls: QueueClass;
  /** Tokens granted: at most the capacity, and at most what an enclosing grant holds. */
  readonly weight: number;
  /** False: no ticket was written (queue off, inside a held grant, or the queue failed open). */
  readonly queued: boolean;
  readonly waitedMs: number;
  release(): Promise<void>;
  /** List a started tool on the ticket, so the place is kept while that tool runs. */
  addProc(pid: number): Promise<void>;
}

const POLL_FAST_MS = 200;
const POLL_SLOW_MS = 1000;
const FAST_FOR_MS = 2000;
const REPRINT_MS = 30_000;
const warned = new Set<string>();

/** Why a queue that answered could not be used (as opposed to a file fault, which throws). */
interface Fault {
  readonly fault: string;
}

/** A broken queue never blocks a build: say so once per queue directory, then go on. */
function failOpen(dir: string, e: unknown, log: (line: string) => void): void {
  if (warned.has(dir)) return;
  warned.add(dir);
  log(
    `t3d queue: ${e instanceof Error ? e.message : String(e)}; running unqueued\n  fix: make ${dir} writable (or remove it), or set T3D_QUEUE=off`,
  );
}

const passThrough = (cls: QueueClass, weight: number): Grant => ({
  cls,
  weight,
  queued: false,
  waitedMs: 0,
  release: async () => {},
  addProc: async () => {},
});

async function enqueue(
  cls: QueueClass,
  want: number,
  cfg: QueueConfig,
  o: QueueOptions,
  env: MutableEnv,
  log: (line: string) => void,
): Promise<Grant | Fault> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => Bun.sleep(ms));
  const machine = o.machine ?? (await thisMachine());
  const live = liveTicket(machine, o.alive ?? procAlive);
  const held = await liveHeld(env, cfg.dir, live);
  const same = held.find((h) => h.cls === cls);
  if (same) return passThrough(cls, Math.min(want, same.weight));
  // A process never waits downward: under a higher class the lower one is already paid for.
  if (held.some((h) => CLASSES.indexOf(h.cls) > CLASSES.indexOf(cls)))
    return passThrough(cls, want);
  const dir = join(cfg.dir, cls);
  const token = randomUUID().replaceAll('-', '');
  const ticket: Ticket = {
    v: 1,
    weight: want,
    token,
    host: machine.host,
    boot: machine.boot,
    procs: [o.self ?? (await procOf(process.pid))],
    cmd: (o.cmd ?? process.argv.slice(1).join(' ')).slice(0, 200),
    cwd: o.cwd ?? process.cwd(),
    since: new Date(now()).toISOString(),
  };
  const hooks = { sleep, ...(o.beforeClaim ? { beforeClaim: o.beforeClaim } : {}) };
  const drop = async (seq: number): Promise<void> => {
    try {
      if (await releaseTicket(dir, seq, token)) await tidy(dir, await listTickets(dir), live);
    } catch (e) {
      failOpen(cfg.dir, e, log);
    }
  };
  const crowded = { fault: `no place in ${dir} after many tries` };
  let seq = await claimTicket(dir, ticket, hooks);
  if (seq === undefined) return crowded;
  const started = now();
  let key: string | undefined;
  let printedAt = 0;
  for (let reclaims = 0; ; ) {
    const l = await lineup(dir, cfg.capacity[cls], live);
    const mine = l.live.find((s) => s.seq === seq && s.ticket.token === token);
    if (!mine) {
      // Cleared from under us (`t3d queue clear`): take a new place at the end.
      const gone = !l.entries.some((e) => e.seq === seq && e.ticket?.token === token);
      if (!gone || ++reclaims > 8) return { fault: `ticket ${seq} in ${dir} does not hold` };
      seq = await claimTicket(dir, ticket, hooks);
      if (seq === undefined) return crowded;
      continue;
    }
    await tidy(dir, l.entries, async (t) => l.live.some((s) => s.ticket.token === t.token));
    if (mine.state === 'running') break;
    const w: Waiting = { cls, weight: want, seq, lineup: l, now: now() };
    const waited = now() - started;
    if (cfg.mode === 'fail' || waited >= cfg.maxWaitMs) {
      await drop(seq);
      throw cfg.mode === 'fail' ? busy(w) : timedOut(w, waited);
    }
    if (waitKey(w) !== key || now() - printedAt >= REPRINT_MS) {
      log(waitLine(w, cfg.maxWaitMs));
      key = waitKey(w);
      printedAt = now();
    }
    await sleep(waited < FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS);
  }
  const waitedMs = now() - started;
  if (key !== undefined) log(`t3d queue: running after ${age(waitedMs)}`);
  const mine = seq;
  addHeld(env, { cls, weight: want, seq: mine, token });
  let released = false;
  return {
    cls,
    weight: want,
    queued: true,
    waitedMs,
    release: async () => {
      if (released) return;
      released = true;
      removeHeld(env, token);
      await drop(mine);
    },
    addProc: async (pid) => {
      try {
        await addTicketProc(dir, mine, await procOf(pid));
      } catch (e) {
        failOpen(cfg.dir, e, log);
      }
    },
  };
}

/** Queue for `weight` tokens of `cls` (`Infinity` = the whole class). Release the grant after. */
export async function acquire(
  cls: QueueClass,
  weight: number,
  o: QueueOptions = {},
): Promise<Grant> {
  const env = o.env ?? process.env;
  const cfg = await loadConfig(env, o.cores);
  const want = Math.min(Math.max(1, Math.floor(weight) || 1), cfg.capacity[cls]);
  if (cfg.mode === 'off') return passThrough(cls, want);
  const log = o.log ?? ((line: string) => console.error(line));
  try {
    const got = await enqueue(cls, want, cfg, o, env, log);
    if (!('fault' in got)) return got;
    failOpen(cfg.dir, got.fault, log);
    return passThrough(cls, want);
  } catch (e) {
    if (isTs23dError(e)) throw e;
    failOpen(cfg.dir, e, log);
    return passThrough(cls, want);
  }
}

/** Run `task` holding `weight` of `cls` (no class: just run it); released whatever happens. */
export async function withQueue<T>(
  cls: QueueClass | undefined,
  weight: number,
  task: (grant?: Grant) => Promise<T>,
  o: QueueOptions = {},
): Promise<T> {
  if (cls === undefined) return task();
  const grant = await acquire(cls, weight, o);
  // Tools the task starts go on the ticket: an orphaned Blender keeps its slot.
  const off = grant.queued ? onToolChild((pid) => void grant.addProc(pid)) : () => {};
  try {
    return await task(grant);
  } finally {
    off();
    await grant.release();
  }
}
