// The machine-wide queue's settings: the three resource classes, their capacities, the mode
// (wait | fail | off) and the maximum wait. Read from the environment (T3D_QUEUE,
// T3D_QUEUE_MAX_WAIT, CI) and from $TS23D_HOME/queue.json, which every checkout on the machine
// shares. Off (T3D_QUEUE=off, or CI set) is decided before any file is read.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { usage } from '../flags.ts';
import { tierPaths } from '../tier-probe.ts';

export const CLASSES = ['cpu', 'blender', 'gpu'] as const;
/** Ordered: a process holding a class never waits for a lower one. */
export type QueueClass = (typeof CLASSES)[number];
export const MODES = ['wait', 'fail', 'off'] as const;
export type QueueMode = (typeof MODES)[number];
export type Env = Readonly<Record<string, string | undefined>>;

export interface QueueConfig {
  readonly mode: QueueMode;
  /** What set the mode: for `t3d doctor` and `t3d queue status`. */
  readonly modeFrom: 'T3D_QUEUE' | 'CI' | 'queue.json' | 'default';
  readonly maxWaitMs: number;
  readonly capacity: Readonly<Record<QueueClass, number>>;
  readonly capacityFrom: 'queue.json' | 'default';
  readonly weights: { readonly pathHero: number; readonly verify: number };
  readonly home: string;
  /** $TS23D_HOME/queue: one folder per class inside. */
  readonly dir: string;
  /** Why queue.json was not used (malformed): defaults apply. */
  readonly warning?: string;
}

export const DEFAULT_MAX_WAIT_S = 1800;

/** Cores left for queued work: a quarter (at least one) stays free for what does not queue. */
export const defaultCpu = (cores: number): number =>
  Math.max(1, cores - Math.max(1, Math.ceil(cores / 4)));

export const machineCores = (): number =>
  typeof navigator === 'undefined' ? 1 : (navigator.hardwareConcurrency ?? 1);

const FIX = 'T3D_QUEUE=wait (queue, the default) | fail (refuse when busy) | off (no queue)';

function envMode(env: Env): QueueMode | undefined {
  const raw = env['T3D_QUEUE'];
  if (raw === undefined || raw === '') return undefined;
  const mode = MODES.find((m) => m === raw);
  if (mode === undefined) throw usage(`T3D_QUEUE='${raw}' is not a queue mode`, FIX);
  return mode;
}

function envMaxWait(env: Env): number | undefined {
  const raw = env['T3D_QUEUE_MAX_WAIT'];
  if (raw === undefined || raw === '') return undefined;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw usage(
      `T3D_QUEUE_MAX_WAIT='${raw}' is not a number of seconds above 0`,
      'T3D_QUEUE_MAX_WAIT=1800 (seconds; the default) or --max-wait <seconds>',
    );
  return seconds * 1000;
}

const isCi = (env: Env): boolean => {
  const ci = env['CI'];
  return ci !== undefined && ci !== '' && ci !== '0' && ci !== 'false';
};

const positiveInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;

type Json = Readonly<Record<string, unknown>>;
const object = (v: unknown): Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {};

/** queue.json as an object; a missing file is `{}`, a malformed one `{}` plus the reason. */
async function readFileConfig(path: string): Promise<{ json: Json; warning?: string }> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { json: {} };
    return { json: {}, warning: `${path} cannot be read (${(e as Error).message})` };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      return { json: {}, warning: `${path} is not a JSON object` };
    return { json: parsed as Json };
  } catch (e) {
    return { json: {}, warning: `${path} is not JSON (${(e as Error).message})` };
  }
}

/** The settings in force. Throws T3D_CLI_USAGE for a bad T3D_QUEUE / T3D_QUEUE_MAX_WAIT. */
export async function loadConfig(env: Env, cores: number = machineCores()): Promise<QueueConfig> {
  const home = tierPaths(env).home;
  const cpu = defaultCpu(cores);
  const base = {
    maxWaitMs: envMaxWait(env) ?? DEFAULT_MAX_WAIT_S * 1000,
    capacity: { cpu, blender: 1, gpu: 1 },
    capacityFrom: 'default',
    weights: { pathHero: Math.min(8, cpu), verify: Math.min(4, cpu) },
    home,
    dir: join(home, 'queue'),
  } as const;
  const fromEnv = envMode(env);
  if (fromEnv === 'off') return { ...base, mode: 'off', modeFrom: 'T3D_QUEUE' };
  if (fromEnv === undefined && isCi(env)) return { ...base, mode: 'off', modeFrom: 'CI' };
  const { json, warning } = await readFileConfig(join(home, 'queue.json'));
  const fileMode = MODES.find((m) => m === json['mode']);
  const caps = object(json['capacity']);
  const weights = object(json['weights']);
  const capacity = {
    cpu: positiveInt(caps['cpu']) ?? cpu,
    blender: positiveInt(caps['blender']) ?? 1,
    gpu: positiveInt(caps['gpu']) ?? 1,
  };
  const seconds = json['maxWaitSeconds'];
  const fileWait = typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : undefined;
  return {
    ...base,
    mode: fromEnv ?? fileMode ?? 'wait',
    modeFrom: fromEnv ? 'T3D_QUEUE' : fileMode ? 'queue.json' : 'default',
    maxWaitMs: envMaxWait(env) ?? fileWait ?? base.maxWaitMs,
    capacity,
    capacityFrom: CLASSES.some((c) => positiveInt(caps[c]) !== undefined)
      ? 'queue.json'
      : 'default',
    weights: {
      pathHero: Math.min(positiveInt(weights['pathHero']) ?? 8, capacity.cpu),
      verify: Math.min(positiveInt(weights['verify']) ?? 4, capacity.cpu),
    },
    ...(warning ? { warning } : {}),
  };
}
