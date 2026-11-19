// Ticket files of one queue class (`$TS23D_HOME/queue/<class>/000000000042.json`). The file name
// is the ticket's sequence number; a number is claimed with link(2), which is atomic and refuses
// an existing name, so two processes never share one. A file is only ever deleted while a higher
// number exists: the top never goes down, and a new ticket always sorts last. A finished ticket
// is overwritten (rename) with a released marker rather than removed, for the same reason.
// Release also leaves `<number>.released` beside the ticket. That file is never overwritten, so a
// writer that read the ticket before the release and renames its copy in after it (a tool being
// listed while `t3d queue clear` runs elsewhere) cannot bring the ticket back.

import { randomUUID } from 'node:crypto';
import { access, link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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

const fileOf = (dir: string, seq: number, ext: string): string =>
  join(dir, `${String(seq).padStart(12, '0')}.${ext}`);

export const ticketFile = (dir: string, seq: number): string => fileOf(dir, seq, 'json');
const releasedFile = (dir: string, seq: number): string => fileOf(dir, seq, 'released');

const errno = (e: unknown): string | undefined => (e as NodeJS.ErrnoException).code;

const isReleased = (dir: string, seq: number): Promise<boolean> =>
  access(releasedFile(dir, seq)).then(
    () => true,
    (e: unknown) => {
      if (errno(e) === 'ENOENT') return false;
      throw e;
    },
  );

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
  const ticket = text === undefined ? undefined : parseTicket(text);
  return ticket && !(await isReleased(dir, seq)) ? ticket : undefined;
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
      // The number is this claimant's now: a released file here is left over from an earlier life.
      await rm(releasedFile(dir, next), { force: true });
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

/** Replace ticket file `seq` whole (rename); each write has its own draft, so two never share one. */
async function replace(dir: string, seq: number, text: string): Promise<void> {
  const draft = join(dir, `draft.${randomUUID()}`);
  try {
    await writeFile(draft, text, { mode: 0o600 });
    await rename(draft, ticketFile(dir, seq));
  } finally {
    await rm(draft, { force: true });
  }
}

/**
 * Mark the ticket released when it still carries `token`; false when it does not. The files stay
 * until a higher number exists (see `tidy`).
 */
export async function releaseTicket(dir: string, seq: number, token: string): Promise<boolean> {
  if ((await readTicket(dir, seq))?.token !== token) return false;
  // The released file first: from here on no later write of the ticket file counts.
  await writeFile(releasedFile(dir, seq), '', { mode: 0o600 });
  await replace(dir, seq, RELEASED);
  return true;
}

/**
 * Add a process to the ticket (a tool the owner started), so the ticket outlives the owner. False
 * when the ticket is not `token`'s any more, already lists the process, or was released meanwhile.
 * One process must not run two of these on one ticket at once (acquire.ts chains them).
 * `beforeWrite` runs between the read and the write: tests release from "another process" there.
 */
export async function addTicketProc(
  dir: string,
  seq: number,
  token: string,
  proc: Proc,
  beforeWrite?: () => Promise<void>,
): Promise<boolean> {
  const now = await readTicket(dir, seq);
  if (now?.token !== token) return false;
  if (now.procs.some((p) => p.pid === proc.pid && p.start === proc.start)) return false;
  await beforeWrite?.();
  await replace(dir, seq, JSON.stringify({ ...now, procs: [...now.procs, proc] } satisfies Ticket));
  if (!(await isReleased(dir, seq))) return true;
  // Released by another process since the read: this write went over its marker, so put it back.
  await replace(dir, seq, RELEASED);
  return false;
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
    // The ticket first: a released file without its ticket holds nothing and is in nobody's way.
    await rm(ticketFile(dir, e.seq), { force: true });
    await rm(releasedFile(dir, e.seq), { force: true });
    removed++;
  }
  return removed;
}
