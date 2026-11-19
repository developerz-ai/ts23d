// Is the owner of a queue ticket still running? A process is named by pid plus its kernel start
// time, so a reused pid is not mistaken for the owner; a zombie (state Z or X) holds nothing.
// Where there is no /proc (macOS, Windows) only `kill(pid, 0)` is left. A ticket also names the
// host and the boot it was written in: after a reboot, or from another host on a shared home,
// its pids mean nothing.

import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';

export interface Proc {
  readonly pid: number;
  /** Field 22 of /proc/<pid>/stat (ticks since boot); absent where there is no /proc. */
  readonly start?: string;
}

export interface Machine {
  readonly host: string;
  /** /proc/sys/kernel/random/boot_id; '' where there is none. */
  readonly boot: string;
}

/** State letter and start time of `pid`; undefined when it (or /proc) is absent. */
export async function procStat(
  pid: number,
  proc = '/proc',
): Promise<{ state: string; start: string } | undefined> {
  const stat = await readFile(`${proc}/${pid}/stat`, 'utf8').catch(() => undefined);
  if (stat === undefined) return undefined;
  // The command name may hold spaces and parentheses: count from after its closing one.
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const [state, start] = [fields[0], fields[19]];
  return state !== undefined && start !== undefined ? { state, start } : undefined;
}

/** Does this machine have a /proc that can prove a start time? */
export const hasProc = async (proc = '/proc'): Promise<boolean> =>
  (await procStat(process.pid, proc)) !== undefined;

const signalZero = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: it exists and belongs to someone else.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** True while the very process `p` names is running (not a zombie, not a reused pid). */
export async function procAlive(p: Proc, proc = '/proc'): Promise<boolean> {
  if (!(await hasProc(proc))) return signalZero(p.pid);
  const now = await procStat(p.pid, proc);
  if (now === undefined || now.state === 'Z' || now.state === 'X') return false;
  return p.start === undefined || now.start === p.start;
}

/** `pid` with its start time, as a ticket records it. */
export async function procOf(pid: number, proc = '/proc'): Promise<Proc> {
  const start = (await procStat(pid, proc))?.start;
  return start === undefined ? { pid } : { pid, start };
}

export async function thisMachine(): Promise<Machine> {
  const boot = await readFile('/proc/sys/kernel/random/boot_id', 'utf8').catch(() => '');
  return { host: hostname(), boot: boot.trim() };
}
