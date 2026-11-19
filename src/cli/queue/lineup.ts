// Who is running and who is waiting in one queue class. The admission rule: a ticket runs when
// the weights of the live tickets before it, plus its own, fit in the capacity. Waiting tickets
// count too (strict FIFO: nothing jumps a waiting heavy job), so an admitted ticket stays
// admitted: tickets before it only ever leave.

import type { Machine, Proc } from './liveness.ts';
import { type Entry, listTickets, type Ticket } from './tickets.ts';

export interface Slot {
  readonly seq: number;
  readonly ticket: Ticket;
  /** The ticket's weight, at most the capacity (a bigger request runs alone). */
  readonly weight: number;
  readonly state: 'running' | 'waiting';
}

export interface Lineup {
  readonly capacity: number;
  /** Tokens held by running tickets. */
  readonly inUse: number;
  /** Live tickets, first in line first. */
  readonly live: readonly Slot[];
  /** Tickets whose owner is gone (dead, zombie, another boot or host): they hold nothing. */
  readonly stale: readonly Entry[];
  readonly entries: readonly Entry[];
}

export type Alive = (p: Proc) => Promise<boolean>;

/** A ticket holds its place while it is from this boot of this host and one of its processes runs. */
export const liveTicket =
  (machine: Machine, alive: Alive) =>
  async (t: Ticket): Promise<boolean> => {
    if (t.host !== machine.host || t.boot !== machine.boot) return false;
    for (const p of t.procs) if (await alive(p)) return true;
    return false;
  };

export async function lineup(
  dir: string,
  capacity: number,
  live: (t: Ticket) => Promise<boolean>,
): Promise<Lineup> {
  const entries = await listTickets(dir);
  const slots: Slot[] = [];
  const stale: Entry[] = [];
  let before = 0;
  let inUse = 0;
  for (const e of entries) {
    if (!e.ticket) continue;
    if (!(await live(e.ticket))) {
      stale.push(e);
      continue;
    }
    const weight = Math.min(Math.max(1, e.ticket.weight), capacity);
    const running = before + weight <= capacity;
    slots.push({ seq: e.seq, ticket: e.ticket, weight, state: running ? 'running' : 'waiting' });
    before += weight;
    if (running) inUse += weight;
  }
  return { capacity, inUse, live: slots, stale, entries };
}
