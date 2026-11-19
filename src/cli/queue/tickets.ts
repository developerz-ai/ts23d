// Ticket files of one queue class (`$TS23D_HOME/queue/<class>/000000000042.json`). The file name
// is the ticket's sequence number; a number is claimed with link(2), which is atomic and refuses
// an existing name, so two processes never share one. A file is only ever deleted while a higher
// number exists: the top never goes down, and a new ticket always sorts last. A finished ticket
// is overwritten (rename) with a released marker rather than removed, for the same reason.

import { link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Proc } from './liveness.ts';

export interface Ticket {
  readonly v: 1;
  readonly weight: number;
  readonly token: string;
  readonly host: string;
  readonly boot: string;
  /** The owner and the tools it started: the ticket lives while any of them does. */
  readonly procs: readonly Proc[];
  readonly cmd: string;
  readonly cwd: string;
  /** ISO time the ticket was written. */
  readonly since: string;
}

export interface Entry {
  readonly seq: number;
  /** Undefined: released, or not a ticket this version reads. */
  readonly ticket?: Ticket;
}

const NAME = /^(\d{12})\.json$/;
const RELEASED = JSON.stringify({ v: 1, released: true });
const MAX_TRIES = 64;

export const ticketFile = (dir: string, seq: number): string =>
  join(dir, `${String(seq).padStart(12, '0')}.json`);

const errno = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

function parseTicket(text: string): Ticket | undefined {
  let t: Partial<Ticket> & { released?: boolean };
  try {
    t = JSON.parse(text) as typeof t;
  } catch {
    return undefined; // written whole (link, rename): not a ticket, so it holds nothing
  }
  if (typeof t !== 'object' || t === null || t.released || t.v !== 1) return undefined;
  if (typeof t.weight !== 'number' || typeof t.token !== 'string' || !Array.isArray(t.procs))
    return undefined;
  return t as Ticket;
}

async function seqs(dir: string): Promise<number[]> {
  const names = await readdir(dir).catch((e: unknown) => {
    if (errno(e) === 'ENOENT') return [] as string[];
    throw e;
  });
  return names
    .flatMap((n) => {
      const m = NAME.exec(n);
      return m ? [Number(m[1])] : [];
    })
    .sort((a, b) => a - b);
}

export async function readTicket(dir: string, seq: number): Promise<Ticket | undefined> {
  const text = await readFile(ticketFile(dir, seq), 'utf8').catch((e: unknown) => {
    if (errno(e) === 'ENOENT') return undefined;
    throw e;
  });
  return text === undefined ? undefined : parseTicket(text);
}

/** Every ticket file of the class, lowest number first. */
export async function listTickets(dir: string): Promise<Entry[]> {
  const out: Entry[] = [];
  for (const seq of await seqs(dir)) {
    const ticket = await readTicket(dir, seq);
    out.push(ticket ? { seq, ticket } : { seq });
  }
  return out;
}

export interface ClaimHooks {
  /** Between reading the top and claiming the next number: tests delay a contender here. */
  readonly beforeClaim?: () => Promise<void>;
  readonly sleep: (ms: number) => Promise<void>;
}

/**
 * Put `ticket` at the end of the line and return its number. A claimant that was delayed since an
 * older listing can land on a tidied number below the top; it sees that, leaves and claims again.
 * Undefined after 64 tries.
 */
export async function claimTicket(
  dir: string,
  ticket: Ticket,
  hooks: ClaimHooks,
): Promise<number | undefined> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const draft = join(dir, `draft.${ticket.token}`);
  await writeFile(draft, JSON.stringify(ticket), { mode: 0o600 });
  try {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const top = (await seqs(dir)).at(-1) ?? 0;
      await hooks.beforeClaim?.();
      const next = top + 1;
      try {
        await link(draft, ticketFile(dir, next));
      } catch (e) {
        if (errno(e) !== 'EEXIST') throw e;
        continue;
      }
      if ((await seqs(dir)).at(-1) === next) return next;
      await rm(ticketFile(dir, next), { force: true });
      // Contenders that keep overtaking each other spread out by pid.
      await hooks.sleep(1 + ((ticket.procs[0]?.pid ?? 0) % 7) + tries);
    }
  } finally {
    await rm(draft, { force: true });
  }
  return undefined; // contention that never settled: the caller runs unqueued
}

/** Overwrite ticket `seq` (atomically) when it still carries `token`; false when it does not. */
async function overwrite(dir: string, seq: number, token: string, text: string): Promise<boolean> {
  if ((await readTicket(dir, seq))?.token !== token) return false;
  const tmp = join(dir, `draft.${token}.next`);
  await writeFile(tmp, text, { mode: 0o600 });
  await rename(tmp, ticketFile(dir, seq));
  return true;
}

/** Mark the ticket released. The file stays until a higher number exists (see `tidy`). */
export const releaseTicket = (dir: string, seq: number, token: string): Promise<boolean> =>
  overwrite(dir, seq, token, RELEASED);

/** Add a process to the ticket (a tool the owner started), so the ticket outlives the owner. */
export async function addTicketProc(dir: string, seq: number, proc: Proc): Promise<boolean> {
  const now = await readTicket(dir, seq);
  if (!now || now.procs.some((p) => p.pid === proc.pid && p.start === proc.start)) return false;
  const next: Ticket = { ...now, procs: [...now.procs, proc] };
  return overwrite(dir, seq, now.token, JSON.stringify(next));
}

/** Remove released and dead tickets below the top. Returns how many files went. */
export async function tidy(
  dir: string,
  entries: readonly Entry[],
  live: (t: Ticket) => Promise<boolean>,
): Promise<number> {
  const top = entries.at(-1)?.seq;
  let removed = 0;
  for (const e of entries) {
    if (top === undefined || e.seq >= top) break;
    if (e.ticket && (await live(e.ticket))) continue;
    await rm(ticketFile(dir, e.seq), { force: true });
    removed++;
  }
  return removed;
}
