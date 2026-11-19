// Which queue class a `t3d` command line takes, and the two queue flags every command accepts
// (`--no-wait`, `--max-wait <seconds>`), which are taken off the line before the command parses
// it. Pure: argv in, need out. Commands that only read or that stay open (list, help, doctor,
// setup, init, plan, server, mcp, queue, build --watch, blender session status|undo|stop) take
// nothing; a watch's rebuilds are `t3d build` children that queue themselves.

import { usage } from '../flags.ts';
import type { QueueClass } from './config.ts';

export interface Need {
  readonly cls: QueueClass;
  readonly weight: number;
}

/** One CPU token: single-threaded work. */
const ONE_CPU: readonly string[] = [
  'build',
  'shot',
  'hero',
  'review',
  'critique',
  'blueprint',
  'icon',
  'gaps',
  'tune',
  'finish',
  'concept',
];
const BLENDER_SESSION_WORK: readonly string[] = ['start', 'run', 'finish'];

const flagValue = (argv: readonly string[], flag: string): string | undefined => {
  const at = argv.indexOf(flag);
  return at < 0 ? undefined : argv[at + 1];
};

/** Is the URL served by this machine (a local model server shares this machine's GPU)? */
export function isLoopback(url: string | undefined): boolean {
  if (url === undefined) return false;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false; // not a URL: the command's own parser reports it
  }
  return (
    host === 'localhost' || host === '[::1]' || host === '0.0.0.0' || /^127(\.\d+){3}$/.test(host)
  );
}

/** The class an adapter's job takes: Blender computes one at a time, a local model owns the GPU. */
export function classOfAdapter(id: string): QueueClass | undefined {
  if (id.startsWith('blender:')) return 'blender';
  const local = /^(?:http|comfy|openai-image):(.+)$/.exec(id);
  return local && isLoopback(local[1]) ? 'gpu' : undefined;
}

export function needOf(argv: readonly string[], pathHeroWeight: number): Need | undefined {
  const cmd = argv[0];
  if (cmd === undefined) return undefined;
  if (argv.some((a) => a === '--help' || a === '-h' || a === '--version')) return undefined;
  if (cmd === 'blender') {
    const work =
      argv[1] === 'review' ||
      (argv[1] === 'session' && BLENDER_SESSION_WORK.includes(argv[2] ?? ''));
    return work ? { cls: 'blender', weight: 1 } : undefined;
  }
  if (cmd === 'neural')
    return argv.slice(1).find((a) => !a.startsWith('-')) === 'run'
      ? { cls: 'cpu', weight: 1 }
      : undefined;
  if (!ONE_CPU.includes(cmd)) return undefined;
  if (cmd === 'build' && argv.includes('--watch')) return undefined;
  if (cmd === 'hero' && flagValue(argv, '--quality') === 'path')
    return { cls: 'cpu', weight: pathHeroWeight };
  if (
    cmd === 'finish' &&
    flagValue(argv, '--model') === 'http' &&
    isLoopback(flagValue(argv, '--endpoint'))
  )
    return { cls: 'gpu', weight: 1 };
  return { cls: 'cpu', weight: 1 };
}

export interface QueueFlags {
  /** The line without the queue flags. */
  readonly rest: readonly string[];
  readonly noWait: boolean;
  readonly maxWaitSeconds?: number;
}

/** Take `--no-wait` and `--max-wait <s>` off the line; what follows a `--` is another command's. */
export function stripQueueFlags(argv: readonly string[]): QueueFlags {
  const rest: string[] = [];
  let noWait = false;
  let maxWaitSeconds: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--') {
      rest.push(...argv.slice(i));
      break;
    }
    if (a === '--no-wait') noWait = true;
    else if (a === '--max-wait') {
      const raw = argv[++i];
      const seconds = Number(raw);
      if (raw === undefined || raw === '' || !Number.isFinite(seconds) || seconds <= 0)
        throw usage(
          `--max-wait needs a number of seconds above 0, got '${raw ?? ''}'`,
          '--max-wait 1800 (seconds to wait in the queue before T3D_QUEUE_TIMEOUT)',
        );
      maxWaitSeconds = seconds;
    } else rest.push(a);
  }
  return { rest, noWait, ...(maxWaitSeconds === undefined ? {} : { maxWaitSeconds }) };
}
