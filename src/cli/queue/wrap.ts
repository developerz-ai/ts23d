// The one place `t3d` queues a whole command: `queued(argv, task)` takes the queue flags off the
// line, works out the class the command needs, waits for it, runs the command and releases. The
// flags become T3D_QUEUE / T3D_QUEUE_MAX_WAIT for the run, so the jobs a command queues inside
// itself (a Blender step of `t3d neural run`) and its child processes follow them too.

import { isTs23dError } from '../../core/index.ts';
import { parseArgs } from '../args.ts';
import { withQueue } from './acquire.ts';
import { loadConfig } from './config.ts';
import type { MutableEnv } from './held.ts';
import { type Need, needOf, stripQueueFlags } from './needs.ts';

/** Commands with their own parser; the others are checked by `parseArgs` before they queue. */
const OWN_PARSER: readonly string[] = ['concept', 'blender'];

/** A line the command will refuse must not wait in the queue first: it takes nothing. */
function parses(argv: readonly string[]): boolean {
  if (OWN_PARSER.includes(argv[0] ?? '')) return true;
  try {
    parseArgs(argv);
    return true;
  } catch (e) {
    if (isTs23dError(e)) return false;
    throw e;
  }
}

export async function queued(
  argv: readonly string[],
  task: (argv: readonly string[]) => Promise<number>,
  env: MutableEnv = process.env,
): Promise<number> {
  const flags = stripQueueFlags(argv);
  const before = { mode: env['T3D_QUEUE'], wait: env['T3D_QUEUE_MAX_WAIT'] };
  const put = (name: string, value: string | undefined): void => {
    if (value === undefined) delete env[name];
    else env[name] = value;
  };
  try {
    if (flags.maxWaitSeconds !== undefined)
      env['T3D_QUEUE_MAX_WAIT'] = String(flags.maxWaitSeconds);
    const cfg = await loadConfig(env);
    // --no-wait refuses instead of waiting; it does not switch a queue on that is off.
    if (flags.noWait && cfg.mode !== 'off') env['T3D_QUEUE'] = 'fail';
    let need: Need | undefined;
    if (cfg.mode !== 'off') need = needOf(flags.rest, cfg.weights.pathHero);
    if (need && !parses(flags.rest)) need = undefined;
    return await withQueue(need?.cls, need?.weight ?? 1, () => task(flags.rest), {
      env,
      cmd: `t3d ${flags.rest.join(' ')}`,
    });
  } finally {
    put('T3D_QUEUE', before.mode);
    put('T3D_QUEUE_MAX_WAIT', before.wait);
  }
}
