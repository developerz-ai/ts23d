// The text an agent reads while it queues: the wait line (stderr), and the causes of
// T3D_QUEUE_BUSY and T3D_QUEUE_TIMEOUT. Each names who holds the class (pid, command, weight, how
// long, where), so the reader never has to guess what it is waiting for.

import { Ts23dError } from '../../core/index.ts';
import type { QueueClass } from './config.ts';
import type { Lineup, Slot } from './lineup.ts';

/** 12s · 1m12s · 1h05m */
export function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const two = (n: number): string => String(n).padStart(2, '0');
  if (s < 3600) return `${Math.floor(s / 60)}m${two(s % 60)}s`;
  return `${Math.floor(s / 3600)}h${two(Math.floor((s % 3600) / 60))}m`;
}

const sinceMs = (slot: Slot, now: number): number => now - Date.parse(slot.ticket.since);

export function describe(cls: QueueClass, slot: Slot, now: number): string {
  const t = slot.ticket;
  return `pid ${t.procs[0]?.pid ?? '?'} "${t.cmd}" (${cls} ${slot.weight}, ${age(sinceMs(slot, now))}, ${t.cwd})`;
}

const runningOf = (cls: QueueClass, l: Lineup, now: number, mine: number): string =>
  l.live
    .filter((s) => s.state === 'running' && s.seq !== mine)
    .map((s) => describe(cls, s, now))
    .join('; ') || 'nothing (waiting tickets are ahead)';

export interface Waiting {
  readonly cls: QueueClass;
  readonly weight: number;
  readonly seq: number;
  readonly lineup: Lineup;
  readonly now: number;
}

/** 1-based place of ticket `seq` among the live tickets. */
const position = (w: Waiting): number => w.lineup.live.findIndex((s) => s.seq === w.seq) + 1;

export function waitLine(w: Waiting, maxWaitMs: number): string {
  const { cls, lineup: l } = w;
  return `t3d queue: waiting for ${cls} (need ${w.weight} of ${l.capacity}) · position ${position(w)} of ${l.live.length} · running: ${runningOf(cls, l, w.now, w.seq)} · max wait ${age(maxWaitMs)} · T3D_QUEUE=fail to not wait`;
}

/** What makes a wait line worth printing again: who is ahead, not how long they have run. */
export const waitKey = (w: Waiting): string =>
  w.lineup.live
    .filter((s) => s.seq < w.seq)
    .map((s) => `${s.seq}${s.state[0]}`)
    .join(',');

export function busy(w: Waiting): Ts23dError {
  const l = w.lineup;
  const waiting = l.live.filter((s) => s.state === 'waiting' && s.seq !== w.seq).length;
  return new Ts23dError('T3D_QUEUE_BUSY', {
    cause: `${w.cls} is full (${l.inUse} of ${l.capacity} in use, ${waiting} waiting): ${runningOf(w.cls, l, w.now, w.seq)}`,
    fix: 'run it again without --no-wait (T3D_QUEUE=wait) and it queues behind them; t3d queue status shows the line. Do not retry in a loop of your own',
  });
}

export function timedOut(w: Waiting, waitedMs: number): Ts23dError {
  const ahead = w.lineup.live.find((s) => s.seq !== w.seq);
  const pid = ahead?.ticket.procs[0]?.pid;
  const behind = ahead
    ? ` behind pid ${pid ?? '?'} "${ahead.ticket.cmd}" (${ahead.state} ${age(sinceMs(ahead, w.now))})`
    : '';
  return new Ts23dError('T3D_QUEUE_TIMEOUT', {
    cause: `waited ${age(waitedMs)} for ${w.cls} (need ${w.weight} of ${w.lineup.capacity}), still position ${position(w)}${behind}`,
    fix: `t3d queue status; if that process is stuck, end it (kill ${pid ?? '<pid>'}) or drop its ticket (t3d queue clear --pid ${pid ?? '<pid>'}); for a long sweep raise T3D_QUEUE_MAX_WAIT=<seconds>`,
  });
}
