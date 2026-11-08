// definePart's parameter layer: merge overrides onto typed defaults, validate them (type, range,
// choices, the part's own rule) with T3D_PART_PARAMS + a fix, describe them for a catalogue, and
// key them stably for the build cache.

import { Ts23dError } from './errors.ts';

/** A parameter value: a number, string, boolean or a fixed tuple of numbers (a Vec3, a size). */
export type ParamValue = number | string | boolean | readonly number[];

/** Optional knowledge about one parameter: what it means and what it may be. */
export interface ParamSpec<T> {
  readonly doc?: string;
  /** 'm', 'deg', 'count', 'mm'… shown in the catalogue. */
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  /** The only allowed values (a string-literal union: `oneOf: ['M6', 'M8', 'M10']`). */
  readonly oneOf?: readonly T[];
}

export type ParamSchema<P> = { readonly [K in keyof P]?: ParamSpec<P[K]> };

/** One parameter as a catalogue shows it. */
export interface ParamInfo {
  readonly name: string;
  readonly type: 'number' | 'string' | 'boolean' | 'tuple';
  readonly default: ParamValue;
  readonly doc?: string;
  readonly unit?: string;
  readonly min?: number;
  readonly max?: number;
  readonly oneOf?: readonly ParamValue[];
}

/** Parameter overrides for one call; `undefined` keeps the default. */
export type Overrides<P> = { readonly [K in keyof P]?: P[K] | undefined };

function typeOf(v: unknown): ParamInfo['type'] | 'other' {
  if (Array.isArray(v) && v.every((x) => typeof x === 'number')) return 'tuple';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  return 'other';
}

const fail = (part: string, cause: string, fix: string): never => {
  throw new Ts23dError('T3D_PART_PARAMS', { cause: `part '${part}': ${cause}`, fix });
};

const show = (v: unknown): string => JSON.stringify(v) ?? String(v);

/** Check the defaults themselves once, at definePart time. */
export function checkDefaults<P extends object>(part: string, defaults: P): void {
  for (const [k, v] of Object.entries(defaults)) {
    const t = typeOf(v);
    if (t === 'other')
      fail(
        part,
        `default '${k}' is ${show(v)}, not a number, string, boolean or number tuple`,
        'parameters are plain values (a catalogue must print them); pass meshes or functions as separate parts',
      );
    if (t === 'number' && !Number.isFinite(v))
      fail(part, `default '${k}' is ${v}`, 'give every number default a finite value');
  }
}

/** Defaults ⊕ overrides, validated. Unknown keys, wrong types, out-of-range values all throw. */
export function resolveParams<P extends object>(
  part: string,
  defaults: P,
  schema: ParamSchema<P> | undefined,
  overrides: Overrides<P> | undefined,
  validate?: (p: Readonly<P>) => string | undefined,
): Readonly<P> {
  const known = Object.keys(defaults);
  const spec = (schema ?? {}) as Readonly<Record<string, ParamSpec<unknown> | undefined>>;
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (!known.includes(k)) {
      const near = known.filter((n) => n.toLowerCase().startsWith(k.slice(0, 2).toLowerCase()));
      fail(
        part,
        `unknown parameter '${k}'`,
        `use one of: ${known.join(', ')}${near.length ? ` (did you mean '${near[0]}'?)` : ''}`,
      );
    }
    if (v === undefined) continue;
    const want = typeOf((defaults as Record<string, unknown>)[k]);
    if (typeOf(v) !== want)
      fail(part, `'${k}' is ${show(v)}, expected a ${want}`, `pass a ${want}, like the default`);
  }
  const p = { ...defaults, ...stripUndefined(overrides) } as P;
  for (const k of known) {
    const v = (p as Record<string, unknown>)[k];
    const s = spec[k];
    if (typeof v === 'number' && !Number.isFinite(v))
      fail(part, `'${k}' is ${v}`, 'pass a finite number');
    if (typeof v === 'number' && s?.min !== undefined && v < s.min)
      fail(part, `'${k}' = ${v} is below ${s.min}${s.unit ?? ''}`, `use ${k} >= ${s.min}`);
    if (typeof v === 'number' && s?.max !== undefined && v > s.max)
      fail(part, `'${k}' = ${v} is above ${s.max}${s.unit ?? ''}`, `use ${k} <= ${s.max}`);
    if (s?.oneOf && !s.oneOf.some((o) => show(o) === show(v)))
      fail(
        part,
        `'${k}' = ${show(v)} is not allowed`,
        `use one of: ${s.oneOf.map(show).join(', ')}`,
      );
  }
  const problem = validate?.(p);
  if (problem) fail(part, problem, `fix the parameters; defaults: ${show(defaults)}`);
  return p;
}

function stripUndefined<P extends object>(o: Overrides<P> | undefined): Overrides<P> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o ?? {})) if (v !== undefined) out[k] = v;
  return out as Overrides<P>;
}

/** Stable cache key: keys in the defaults' (author-written) order, values as JSON. */
export function paramsKey<P extends object>(defaults: P, p: Readonly<P>): string {
  return Object.keys(defaults)
    .map((k) => `${k}=${show((p as Record<string, unknown>)[k])}`)
    .join('&');
}

/** The parameter table a catalogue prints, in the order the author wrote the defaults. */
export function paramInfo<P extends object>(
  defaults: P,
  schema: ParamSchema<P> | undefined,
): ParamInfo[] {
  const spec = (schema ?? {}) as Readonly<Record<string, ParamSpec<ParamValue> | undefined>>;
  return Object.entries(defaults).map(([name, v]): ParamInfo => {
    const s = spec[name];
    const t = typeOf(v);
    return {
      name,
      type: t === 'other' ? 'string' : t,
      default: v as ParamValue,
      ...(s?.doc ? { doc: s.doc } : {}),
      ...(s?.unit ? { unit: s.unit } : {}),
      ...(s?.min !== undefined ? { min: s.min } : {}),
      ...(s?.max !== undefined ? { max: s.max } : {}),
      ...(s?.oneOf ? { oneOf: s.oneOf } : {}),
    };
  });
}
