// Flag tables and value parsers for `t3d` (args.ts drives them): which flags exist, which take a
// value, and the strict checks that turn a bad value into a coded error with a fix.

import { Ts23dError } from '../core/index.ts';

export interface FinishArgs {
  readonly model: 'mock' | 'http';
  readonly endpoint?: string;
  readonly prompt?: string;
  readonly negative?: string;
  readonly views?: number;
  readonly atlas?: number;
  /** Write the finished GLB even when finish QA rejects it (provenance records why). */
  readonly force: boolean;
  /** `--timeout <s>`: how long the http model may take per request. */
  readonly timeoutMs?: number;
}

/** Flags that stand alone; every other flag takes the next argument as its value. */
export const SWITCHES = [
  '--json',
  '--animations',
  '--no-animations',
  '--no-shot',
  '--physics',
  '--no-sounds',
  '--force',
  '--help',
  '-h',
  '--version',
];
export const VALUED = [
  '--out',
  '--profile',
  '--evals',
  '--seed',
  '--method',
  '--variant',
  '--sheet',
  '--lods',
  '--sheet-size',
  '--size',
  '--az',
  '--el',
  '--fov',
  '--model',
  '--endpoint',
  '--prompt',
  '--negative',
  '--views',
  '--atlas',
  '--timeout',
];

export const usage = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_CLI_USAGE', { cause, fix });

/** A value from a fixed set, else T3D_CLI_USAGE naming the set. */
export function oneOf<T extends string>(flag: string, v: string | undefined, set: readonly T[]): T {
  const hit = set.find((s) => s === v);
  if (hit === undefined)
    throw usage(
      `${flag} takes ${set.join(' | ')}, got ${v === undefined ? 'nothing' : `"${v}"`}`,
      `pass e.g. ${flag} ${set[0]}`,
    );
  return hit;
}

export type MutableFinish = { -readonly [K in keyof FinishArgs]: FinishArgs[K] };
export const FINISH_FLAGS = [
  '--model',
  '--endpoint',
  '--prompt',
  '--negative',
  '--views',
  '--atlas',
  '--timeout',
];

/** `--lods 0,2` → [0, 2]; anything outside 0 | 1 | 2 (or split | single | both) is a usage error. */
export function lodList(v: string | undefined): readonly (0 | 1 | 2)[] {
  const parts = (v ?? '').split(',');
  const bad = v === undefined || parts.some((p) => !/^[012]$/.test(p));
  if (bad)
    throw usage(
      `--lods takes levels from 0,1,2 or a mode from split | single | both, got ${v === undefined ? 'nothing' : `"${v}"`}`,
      'pass e.g. --lods 0,1,2 · --lods 0 · --lods single',
    );
  return [...new Set(parts.map(Number) as (0 | 1 | 2)[])].sort();
}

export function finishFlag(f: MutableFinish, flag: string, v: string | undefined): void {
  const bad = (fix: string): never => {
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `${flag} got ${v === undefined ? 'nothing' : `"${v}"`}`,
      fix,
    });
  };
  if (v === undefined) bad(`pass a value after ${flag}`);
  const text = v ?? '';
  if (flag === '--model') {
    if (text !== 'mock' && text !== 'http')
      bad('--model mock (procedural, offline) or http (--endpoint)');
    f.model = text === 'http' ? 'http' : 'mock';
  } else if (flag === '--endpoint') f.endpoint = text;
  else if (flag === '--prompt') f.prompt = text;
  else if (flag === '--negative') f.negative = text;
  else if (flag === '--timeout') {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n) || n <= 0)
      bad('--timeout takes seconds > 0 for the http model, e.g. --timeout 600');
    f.timeoutMs = n * 1000;
  } else {
    const n = Number(text);
    const [lo, hi] = flag === '--views' ? [1, 24] : [256, 4096];
    if (!Number.isInteger(n) || n < lo || n > hi)
      bad(`${flag} takes a whole number in ${lo}…${hi}`);
    if (flag === '--views') f.views = n;
    else f.atlas = n;
  }
}
