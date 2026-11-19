// The `queue` group of `t3d doctor`: the mode and capacities with where they come from, whether
// the queue folder can be written, live and stale tickets, whether process start times can be
// read (/proc), the GPU lease holder, and a warning when more than one Blender session is open.
// Read-only, like the rest of doctor.

import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Check } from '../tier-probe.ts';
import { CLASSES, type Env, loadConfig } from './config.ts';
import { hasProc } from './liveness.ts';
import { queueStatus, type StatusDeps } from './status.ts';

/** Can `dir` be written, or created under its nearest existing parent? */
async function writable(dir: string): Promise<boolean> {
  for (let p = dir; ; p = dirname(p)) {
    try {
      await access(p, constants.W_OK);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(p) === p) return false;
    }
  }
}

export async function queueChecks(env: Env, deps: StatusDeps = {}): Promise<Check[]> {
  const group = 'queue' as const;
  const cfg = await loadConfig(env, deps.cores);
  const s = await queueStatus(env, deps);
  const caps = CLASSES.map((c) => `${c} ${s.classes[c].capacity}`).join(', ');
  const tickets = CLASSES.flatMap((c) => s.classes[c].tickets);
  const stale = tickets.filter((t) => t.state === 'stale').length;
  const canWrite = s.unreadable === undefined && (await writable(s.dir));
  const proc = await hasProc();
  const sessions = s.blenderSessions;
  return [
    {
      id: 'queue',
      group,
      status: cfg.warning ? 'warn' : cfg.mode === 'off' ? 'info' : 'ok',
      detail: `mode ${cfg.mode} (${cfg.modeFrom}); capacity ${caps} (${cfg.capacityFrom}); max wait ${cfg.maxWaitMs / 1000} s${cfg.warning ? `; ${cfg.warning}, defaults in use` : ''}`,
      ...(cfg.warning
        ? {
            fix: `fix or delete ${cfg.home}/queue.json: {"mode":"wait","maxWaitSeconds":1800,"capacity":{"cpu":12,"blender":1,"gpu":1},"weights":{"pathHero":8,"verify":4}}`,
          }
        : cfg.mode === 'off'
          ? { fix: 'T3D_QUEUE=wait turns the queue on (it is off under CI on purpose)' }
          : {}),
    },
    {
      id: 'queue-dir',
      group,
      status: canWrite ? 'ok' : 'warn',
      detail: `${s.dir} ${canWrite ? 'can be written' : `cannot be used${s.unreadable ? ` (${s.unreadable})` : ''}: commands run unqueued`}`,
      ...(canWrite
        ? {}
        : { fix: `make ${s.dir} a folder this user can write, or set T3D_QUEUE=off` }),
    },
    {
      id: 'queue-tickets',
      group,
      status: stale > 0 ? 'warn' : 'ok',
      detail: `${tickets.length - stale} live, ${stale} stale (a stale ticket holds nothing)`,
      ...(stale > 0 ? { fix: 't3d queue clear --stale' } : {}),
    },
    {
      id: 'queue-liveness',
      group,
      status: proc ? 'ok' : 'info',
      detail: proc
        ? 'owners are proven by pid and start time (/proc)'
        : 'no /proc: owners are checked by pid only, so a reused pid can hold a ticket until the wait times out',
      ...(proc
        ? {}
        : { fix: 't3d queue clear --pid <pid> when a dead command still holds a slot' }),
    },
    {
      id: 'gpu-lease',
      group,
      status: 'ok',
      detail: s.gpuLease ? `GPU lease held by ${s.gpuLease}` : 'GPU lease free',
    },
    {
      id: 'blender-sessions',
      group,
      status: sessions.length > 1 ? 'warn' : 'ok',
      detail: `${sessions.length} Blender session(s) open${sessions.length ? `: ${sessions.map((b) => b.name).join(', ')}` : ''}`,
      ...(sessions.length > 1
        ? {
            fix: 'one Blender computes at a time: send batches to one session and stop the others (t3d blender session stop --name <n>)',
          }
        : {}),
    },
  ];
}
