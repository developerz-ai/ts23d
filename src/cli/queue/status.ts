// What `t3d queue status` and `t3d doctor` show: per class the capacity, the tokens in use and
// the tickets in order (running, waiting, stale), plus what the queue does not manage but an
// agent wants beside it: live Blender sessions (an idle session holds no slot), the GPU lease
// holder written by the reference model server, the load average and the available RAM.
// Read-only: it never writes or tidies.

import { readdir, readFile } from 'node:fs/promises';
import { homedir, loadavg } from 'node:os';
import { join } from 'node:path';
import { CLASSES, type Env, loadConfig, type QueueClass, type QueueConfig } from './config.ts';
import { type Alive, lineup, liveTicket } from './lineup.ts';
import { type Machine, procAlive, thisMachine } from './liveness.ts';
import type { Ticket } from './tickets.ts';

export interface TicketRow {
  readonly seq: number;
  readonly state: 'running' | 'waiting' | 'stale';
  readonly weight: number;
  readonly pid?: number;
  readonly cmd: string;
  readonly cwd: string;
  readonly since: string;
  readonly ageSeconds: number;
}

export interface ClassStatus {
  readonly capacity: number;
  readonly inUse: number;
  readonly tickets: readonly TicketRow[];
}

export interface QueueStatus {
  readonly mode: QueueConfig['mode'];
  readonly modeFrom: QueueConfig['modeFrom'];
  readonly maxWaitSeconds: number;
  readonly dir: string;
  readonly classes: Readonly<Record<QueueClass, ClassStatus>>;
  /** Blender sessions whose process is running; they hold the blender class only while they work. */
  readonly blenderSessions: readonly { readonly name: string; readonly pid: number }[];
  /** `pid <n> <model>` from $TS23D_HOME/gpu/machine.lock, as the model server wrote it. */
  readonly gpuLease?: string;
  readonly loadAverage: readonly number[];
  readonly memAvailableGb?: number;
  readonly warning?: string;
  /** Why the queue folder could not be read: commands run unqueued until it can. */
  readonly unreadable?: string;
}

export interface StatusDeps {
  readonly cores?: number;
  readonly now?: () => number;
  readonly alive?: Alive;
  readonly machine?: Machine;
}

const row = (seq: number, t: Ticket, state: TicketRow['state'], weight: number, now: number) => {
  const pid = t.procs[0]?.pid;
  return {
    seq,
    state,
    weight,
    ...(pid === undefined ? {} : { pid }),
    cmd: t.cmd,
    cwd: t.cwd,
    since: t.since,
    ageSeconds: Math.max(0, Math.round((now - Date.parse(t.since)) / 1000)),
  } satisfies TicketRow;
};

async function liveSessions(env: Env, alive: Alive): Promise<{ name: string; pid: number }[]> {
  const root =
    env['T3D_BLENDER_SESSIONS'] ??
    join(
      env['XDG_CACHE_HOME'] || join(env['HOME'] || homedir(), '.cache'),
      't3d',
      'blender-sessions',
    );
  const names = await readdir(root).catch(() => [] as string[]);
  const out: { name: string; pid: number }[] = [];
  for (const name of names.sort()) {
    const text = await readFile(join(root, name, 'session.json'), 'utf8').catch(() => undefined);
    if (text === undefined) continue;
    let meta: { pid?: unknown; startTime?: unknown };
    try {
      meta = JSON.parse(text) as typeof meta;
    } catch {
      continue; // not a session folder
    }
    if (typeof meta.pid !== 'number') continue;
    const start = typeof meta.startTime === 'string' ? { start: meta.startTime } : {};
    if (await alive({ pid: meta.pid, ...start })) out.push({ name, pid: meta.pid });
  }
  return out;
}

async function memAvailableGb(): Promise<number | undefined> {
  const info = await readFile('/proc/meminfo', 'utf8').catch(() => '');
  const kb = /^MemAvailable:\s+(\d+) kB/m.exec(info)?.[1];
  return kb === undefined ? undefined : Math.round(Number(kb) / 1e5) / 10;
}

export async function queueStatus(env: Env, deps: StatusDeps = {}): Promise<QueueStatus> {
  // Status reads the line whatever the mode: an `off` shell can still look.
  const cfg = await loadConfig({ ...env, T3D_QUEUE: undefined, CI: undefined }, deps.cores);
  const seen = await loadConfig(env, deps.cores);
  const now = (deps.now ?? Date.now)();
  const alive = deps.alive ?? procAlive;
  const live = liveTicket(deps.machine ?? (await thisMachine()), alive);
  const classes = {} as Record<QueueClass, ClassStatus>;
  let unreadable: string | undefined;
  for (const cls of CLASSES) {
    const l = await lineup(join(cfg.dir, cls), cfg.capacity[cls], live).catch((e: unknown) => {
      unreadable = e instanceof Error ? e.message : String(e);
      return { capacity: cfg.capacity[cls], inUse: 0, live: [], stale: [], entries: [] };
    });
    const rows = [
      ...l.live.map((s) => ({ ...row(s.seq, s.ticket, s.state, s.weight, now) })),
      ...l.stale.flatMap((e) =>
        e.ticket ? [row(e.seq, e.ticket, 'stale', e.ticket.weight, now)] : [],
      ),
    ].sort((a, b) => a.seq - b.seq);
    classes[cls] = { capacity: l.capacity, inUse: l.inUse, tickets: rows };
  }
  // The lock file outlives its holder (the kernel drops the flock, not the text).
  const text = await readFile(join(cfg.home, 'gpu', 'machine.lock'), 'utf8').catch(() => '');
  const holder = /^pid (\d+)/.exec(text.trim())?.[1];
  const lease = holder !== undefined && (await alive({ pid: Number(holder) })) ? text.trim() : '';
  const mem = await memAvailableGb();
  return {
    mode: seen.mode,
    modeFrom: seen.modeFrom,
    maxWaitSeconds: seen.maxWaitMs / 1000,
    dir: cfg.dir,
    classes,
    blenderSessions: await liveSessions(env, alive),
    ...(lease ? { gpuLease: lease } : {}),
    loadAverage: loadavg().map((n) => Math.round(n * 100) / 100),
    ...(mem === undefined ? {} : { memAvailableGb: mem }),
    ...(cfg.warning ? { warning: cfg.warning } : {}),
    ...(unreadable === undefined ? {} : { unreadable }),
  };
}
