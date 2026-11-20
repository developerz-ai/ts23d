// The checks the Blender step field tables are made of (blender-step-fields.ts,
// blender-step-stroke.ts): numbers in range, names, lists, masks, and `shape`, which refuses unknown
// fields and fills defaults. Every refusal is T3D_RECIPE_INVALID naming the step and field.

import { dmath, Ts23dError } from '../core/index.ts';

/** `at` names the step and field, e.g. "step 3 (bake).size". */
export type Check = (v: unknown, at: string) => unknown;
export interface Field {
  readonly check: Check;
  /** Value used when the field is absent; `undefined` with `required: false` leaves it out. */
  readonly def?: unknown;
  readonly required?: boolean;
}

export function invalidStep(at: string, cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `blender ${at}: ${cause}`, fix });
}

export const num =
  (lo = Number.NEGATIVE_INFINITY, hi = Number.POSITIVE_INFINITY, open = false): Check =>
  (v, at) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      invalidStep(at, `${String(v)} is not a finite number`, 'pass metres / radians as numbers');
    const n = v as number;
    if (n < lo || n > hi || (open && n === lo))
      invalidStep(at, `${n} is outside ${open ? '(' : '['}${lo}, ${hi}]`, 'pass a value in range');
    return n;
  };
export const int =
  (lo: number, hi: number): Check =>
  (v, at) => {
    const n = num(lo, hi)(v, at) as number;
    if (!Number.isInteger(n)) invalidStep(at, `${n} is not an integer`, 'pass a whole number');
    return n;
  };
export const bool: Check = (v, at) =>
  typeof v === 'boolean' ? v : invalidStep(at, `${String(v)} is not a boolean`, 'pass true/false');
export const oneOf =
  (...names: readonly string[]): Check =>
  (v, at) =>
    typeof v === 'string' && names.includes(v)
      ? v
      : invalidStep(at, `'${String(v)}' is not one of ${names.join(', ')}`, 'use a listed value');
export const list =
  (item: Check, min: number, max: number): Check =>
  (v, at) => {
    if (!Array.isArray(v) || v.length < min || v.length > max)
      invalidStep(at, `needs ${min}..${max} entries`, 'pass an array of that length');
    return (v as unknown[]).map((x, i) => item(x, `${at}[${i}]`));
  };
export const vec3 = list(num(), 3, 3);
export const boneName: Check = (v, at) =>
  typeof v === 'string' && /^[a-z][a-z0-9_]*$/.test(v)
    ? v
    : invalidStep(at, `'${String(v)}' is not a bone name`, "use the skeleton's snake_case names");
export const shape =
  (fields: Readonly<Record<string, Field>>): Check =>
  (v, at) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v))
      invalidStep(at, 'is not an object', `pass { ${Object.keys(fields).join(', ')} }`);
    const o = v as Readonly<Record<string, unknown>>;
    for (const k of Object.keys(o))
      if (!Object.hasOwn(fields, k))
        invalidStep(at, `has unknown field '${k}'`, `fields: ${Object.keys(fields).join(', ')}`);
    const out: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(fields)) {
      if (o[k] !== undefined) out[k] = f.check(o[k], `${at}.${k}`);
      else if (f.required) invalidStep(at, `needs '${k}'`, `add ${k} to the step`);
      else if (f.def !== undefined) out[k] = f.def;
    }
    return out;
  };

export const req = (check: Check): Field => ({ check, required: true });
export const opt = (check: Check, def?: unknown): Field => ({ check, def });

export const mask: Check = (v, at) => {
  const kind = (v as { kind?: unknown } | null)?.kind;
  const feather = opt(num(0), 0);
  if (kind === 'z')
    return shape({ kind: req(oneOf('z')), min: req(num()), max: req(num()), feather })(v, at);
  if (kind === 'sphere')
    return shape({ kind: req(oneOf('sphere')), at: req(vec3), r: req(num(0, 1e6, true)), feather })(
      v,
      at,
    );
  return invalidStep(
    at,
    `kind '${String(kind)}' is not 'z' or 'sphere'`,
    'use a z range or sphere',
  );
};
export const weightMask: Check = (v, at) => {
  const kind = (v as { kind?: unknown } | null)?.kind;
  const feather = opt(num(0), 0);
  if (kind === 'box')
    return shape({ kind: req(oneOf('box')), min: req(vec3), max: req(vec3), feather })(v, at);
  if (kind === 'plane') {
    const p = shape({ kind: req(oneOf('plane')), point: req(vec3), normal: req(vec3), feather })(
      v,
      at,
    ) as { normal: number[] };
    if (dmath.norm(p.normal) < 1e-9)
      invalidStep(`${at}.normal`, 'has no length', 'pass the direction the kept side faces');
    return p;
  }
  if (kind === 'z' || kind === 'sphere') return mask(v, at);
  return invalidStep(
    at,
    `kind '${String(kind)}' is not 'z', 'sphere', 'box' or 'plane'`,
    'use one of those masks',
  );
};
export const text =
  (max: number): Check =>
  (v, at) => {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max)
      invalidStep(at, `is not a non-empty string of at most ${max} characters`, 'pass the text');
    return v;
  };
export const unique =
  (item: Check, max: number): Check =>
  (v, at) => {
    const m = list(item, 1, max)(v, at) as string[];
    if (new Set(m).size !== m.length) invalidStep(at, 'names an entry twice', 'list each once');
    return m;
  };
export const maps: Check = (v, at) => {
  const m = list(oneOf('albedo', 'normal', 'ao', 'roughness'), 1, 4)(v, at) as string[];
  if (new Set(m).size !== m.length) invalidStep(at, 'names a map twice', 'list each map once');
  return m;
};
export const lodTriangles: Check = (v, at) => {
  const t = list(int(4, 10_000_000), 1, 2)(v, at) as number[];
  if (t.length === 2 && (t[1] ?? 0) >= (t[0] ?? 0))
    invalidStep(at, `[${t.join(', ')}] does not fall`, 'give lod1 then a smaller lod2');
  return t;
};
export const focus = list(
  shape({ at: req(vec3), r: req(num(0, 1e6, true)), weight: req(num(1, 16)) }),
  1,
  32,
);
export const size = int(16, 8192);
export const pos = num(0, 1e6, true);
