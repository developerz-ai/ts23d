// `t3d queue status | clear | run | hold`: look at the machine-wide queue, drop tickets, and run
// any command under it.
//   status [--json]                         classes, tickets in order, sessions, lease, load, RAM
//   clear --stale | --pid <n> | --all       drop tickets (it ends no process)
//   run [--cpu <n|all>] [--blender] [--gpu] -- <cmd…>   queue any command; exit code = the command's
//   hold -- <cmd…>                          run --cpu all: the machine drains, the command runs alone

import { constants } from 'node:os';
import { join } from 'node:path';
import { isTs23dError, type Ts23dError } from '../../core/index.ts';
import { usage } from '../flags.ts';
import { envelope, printError } from '../report.ts';
import { type Grant, withQueue } from './acquire.ts';
import { CLASSES, loadConfig, type QueueClass } from './config.ts';
import { lineup, liveTicket } from './lineup.ts';
import { procAlive, thisMachine } from './liveness.ts';
import { type QueueStatus, queueStatus } from './status.ts';
import { listTickets, releaseTicket, tidy } from './tickets.ts';
import { age } from './wait-line.ts';

const USAGE =
  't3d queue status [--json] · t3d queue clear --stale | --pid <n> | --all · t3d queue run [--cpu <n|all>] [--blender] [--gpu] -- <command…> · t3d queue hold -- <command…>';

const bad = (cause: string): Ts23dError => usage(cause, USAGE);

export function printStatus(s: QueueStatus): void {
  console.log(
    `queue ${s.mode} (${s.modeFrom}) · max wait ${age(s.maxWaitSeconds * 1000)} · ${s.dir}`,
  );
  for (const cls of CLASSES) {
    const c = s.classes[cls];
    console.log(`${cls}  ${c.inUse} of ${c.capacity} in use`);
    for (const t of c.tickets)
      console.log(
        `  ${t.state.padEnd(7)} ${cls} ${t.weight}  pid ${t.pid ?? '?'}  ${age(t.ageSeconds * 1000)}  "${t.cmd}"  ${t.cwd}`,
      );
  }
  const sessions = s.blenderSessions.map((b) => `${b.name} (pid ${b.pid})`).join(', ');
  console.log(`blender sessions open: ${sessions || 'none'} (an idle session holds no slot)`);
  console.log(`gpu lease: ${s.gpuLease ?? 'free'}`);
  const ram = s.memAvailableGb === undefined ? '' : ` · ${s.memAvailableGb} GB RAM available`;
  console.log(`load ${s.loadAverage.join(' ')}${ram}`);
  if (s.warning) console.log(`! ${s.warning}: defaults in use`);
  if (s.unreadable)
    console.log(`! the queue cannot be read (${s.unreadable}): commands run unqueued`);
}

type Clear = { readonly what: 'stale' | 'all' } | { readonly what: 'pid'; readonly pid: number };

function clearArgs(argv: readonly string[]): Clear {
  const [flag, value, ...extra] = argv.filter((a) => a !== '--json');
  if (flag === '--stale' && value === undefined) return { what: 'stale' };
  if (flag === '--all' && value === undefined) return { what: 'all' };
  const pid = Number(value);
  if (flag === '--pid' && extra.length === 0 && Number.isInteger(pid) && pid > 0)
    return { what: 'pid', pid };
  throw bad(`t3d queue clear needs one of --stale, --pid <n>, --all (got '${argv.join(' ')}')`);
}

/** Drop the chosen tickets of every class. Returns how many; no process is touched. */
export async function clearTickets(env: NodeJS.ProcessEnv, c: Clear): Promise<number> {
  const cfg = await loadConfig({ ...env, T3D_QUEUE: undefined, CI: undefined });
  const live = liveTicket(await thisMachine(), procAlive);
  let dropped = 0;
  for (const cls of CLASSES) {
    const dir = join(cfg.dir, cls);
    const l = await lineup(dir, cfg.capacity[cls], live);
    const stale = new Set(l.stale.map((e) => e.seq));
    for (const e of l.entries) {
      if (!e.ticket) continue;
      const hit =
        c.what === 'all' ||
        (c.what === 'stale' && stale.has(e.seq)) ||
        (c.what === 'pid' && e.ticket.procs.some((p) => p.pid === c.pid));
      // Released, not removed: the highest number must stay (tickets.ts).
      if (hit && (await releaseTicket(dir, e.seq, e.ticket.token))) dropped++;
    }
    await tidy(dir, await listTickets(dir), live);
  }
  return dropped;
}

interface RunArgs {
  readonly needs: readonly { readonly cls: QueueClass; readonly weight: number }[];
  readonly command: readonly string[];
}

function runArgs(argv: readonly string[], hold: boolean): RunArgs {
  const split = argv.indexOf('--');
  const command = split < 0 ? [] : argv.slice(split + 1);
  if (command.length === 0) throw bad('no command after `--`');
  const want = new Map<QueueClass, number>();
  const flags = argv.slice(0, split);
  for (let i = 0; i < flags.length; i++) {
    const a = flags[i];
    if (a === '--json') continue;
    if (hold) throw bad(`t3d queue hold takes no flag '${a}'`);
    if (a === '--blender' || a === '--gpu') want.set(a === '--gpu' ? 'gpu' : 'blender', 1);
    else if (a === '--cpu') {
      const raw = flags[++i];
      const n = raw === 'all' ? Number.POSITIVE_INFINITY : Number(raw);
      if (raw === undefined || !(n >= 1) || (raw !== 'all' && !Number.isInteger(n)))
        throw bad(`--cpu needs a whole number of tokens or 'all', got '${raw ?? ''}'`);
      want.set('cpu', n);
    } else throw bad(`t3d queue run does not know '${a}'`);
  }
  if (hold) want.set('cpu', Number.POSITIVE_INFINITY);
  if (want.size === 0) want.set('cpu', 1);
  // Lowest class first: a process may take a higher class while holding a lower one.
  const needs = CLASSES.flatMap((cls) => {
    const weight = want.get(cls);
    return weight === undefined ? [] : [{ cls, weight }];
  });
  return { needs, command };
}

/** Start the command with the grants' tickets naming it; signals go to it; its code comes back. */
async function spawnHeld(command: readonly string[], grants: readonly Grant[]): Promise<number> {
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn([...command], {
      stdio: ['inherit', 'inherit', 'inherit'],
      env: process.env,
    });
  } catch (e) {
    throw bad(`cannot start '${command[0]}': ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const g of grants) await g.addProc(child.pid);
  const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
  const handlers = (['SIGINT', 'SIGTERM'] as const).map((s) => [s, forward(s)] as const);
  for (const [s, h] of handlers) process.on(s, h);
  try {
    const code = await child.exited;
    const signal = child.signalCode;
    return typeof signal === 'string' ? 128 + (constants.signals[signal] ?? 0) : code;
  } finally {
    for (const [s, h] of handlers) process.removeListener(s, h);
  }
}

async function runHeld(a: RunArgs): Promise<number> {
  const cmd = a.command.join(' ');
  const step = (i: number, grants: readonly Grant[]): Promise<number> => {
    const need = a.needs[i];
    if (!need) return spawnHeld(a.command, grants);
    return withQueue(need.cls, need.weight, (g) => step(i + 1, g ? [...grants, g] : grants), {
      cmd,
    });
  };
  return step(0, []);
}

export async function queueMain(argv: readonly string[], json: boolean): Promise<number> {
  try {
    const [sub, ...rest] = argv;
    if (sub === 'run' || sub === 'hold') return await runHeld(runArgs(rest, sub === 'hold'));
    if (sub === 'clear') {
      const dropped = await clearTickets(process.env, clearArgs(rest));
      if (json) envelope(true, { dropped, processesEnded: 0 });
      else console.log(`dropped ${dropped} ticket(s); no process was ended`);
      return 0;
    }
    if (sub !== 'status' || rest.some((a) => a !== '--json'))
      throw bad(
        sub === undefined
          ? 't3d queue needs a subcommand'
          : `t3d queue does not know '${argv.filter((a) => a !== '--json').join(' ')}'`,
      );
    const status = await queueStatus(process.env);
    if (json) envelope(true, status);
    else printStatus(status);
    return 0;
  } catch (e) {
    if (isTs23dError(e)) return printError(e, json);
    throw e;
  }
}
