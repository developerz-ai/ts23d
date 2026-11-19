// What this process already holds in the queue. Grants travel in the environment
// (T3D_QUEUE_TOKEN = `class:weight:seq:token,…`) so that child processes inherit them: a `t3d`
// started under `t3d queue hold`, or a tool started by a queued command, passes through instead
// of queueing behind its own parent. A token is honoured only while its ticket file still carries
// it and is live, so a stale variable (the parent died or released) grants nothing.

import { join } from 'node:path';
import { CLASSES, type QueueClass } from './config.ts';
import { readTicket, type Ticket } from './tickets.ts';

export interface Held {
  readonly cls: QueueClass;
  readonly weight: number;
  readonly seq: number;
  readonly token: string;
}

export type MutableEnv = Record<string, string | undefined>;
const VAR = 'T3D_QUEUE_TOKEN';

export function parseHeld(env: Readonly<MutableEnv>): Held[] {
  return (env[VAR] ?? '').split(',').flatMap((part) => {
    const [c, w, s, token] = part.split(':');
    const cls = CLASSES.find((k) => k === c);
    const [weight, seq] = [Number(w), Number(s)];
    if (!cls || !token || !Number.isInteger(weight) || !Number.isInteger(seq)) return [];
    return [{ cls, weight, seq, token }];
  });
}

function write(env: MutableEnv, held: readonly Held[]): void {
  if (held.length === 0) delete env[VAR];
  else env[VAR] = held.map((h) => `${h.cls}:${h.weight}:${h.seq}:${h.token}`).join(',');
}

export const addHeld = (env: MutableEnv, h: Held): void => write(env, [...parseHeld(env), h]);

export const removeHeld = (env: MutableEnv, token: string): void =>
  write(
    env,
    parseHeld(env).filter((h) => h.token !== token),
  );

/** The grants in the environment whose ticket is still theirs and still live. */
export async function liveHeld(
  env: Readonly<MutableEnv>,
  queueDir: string,
  live: (t: Ticket) => Promise<boolean>,
): Promise<Held[]> {
  const out: Held[] = [];
  for (const h of parseHeld(env)) {
    const ticket = await readTicket(join(queueDir, h.cls), h.seq);
    if (ticket?.token === h.token && (await live(ticket))) out.push(h);
  }
  return out;
}

/** CPU tokens this process runs under (its own grant or an inherited one); undefined: unqueued. */
export const grantedCpu = (env: Readonly<MutableEnv> = process.env): number | undefined =>
  parseHeld(env).find((h) => h.cls === 'cpu')?.weight;
