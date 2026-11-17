// The field table of the Blender step program (blender-steps.ts): per op, every field with its
// check and default. `normaliseStep` refuses unknown ops, unknown fields, missing required fields
// and non-finite or out-of-range numbers (T3D_RECIPE_INVALID naming the step index), and fills the
// defaults, so the canonical JSON — and with it the cache key — holds every value Blender will use.

import { Ts23dError } from '../core/index.ts';

/** `at` names the step and field, e.g. "step 3 (bake).size". */
type Check = (v: unknown, at: string) => unknown;
interface Field {
  readonly check: Check;
  /** Value used when the field is absent; `undefined` with `required: false` leaves it out. */
  readonly def?: unknown;
  readonly required?: boolean;
}

export function invalidStep(at: string, cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `blender ${at}: ${cause}`, fix });
}

const num =
  (lo = Number.NEGATIVE_INFINITY, hi = Number.POSITIVE_INFINITY, open = false): Check =>
  (v, at) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
      invalidStep(at, `${String(v)} is not a finite number`, 'pass metres / radians as numbers');
    const n = v as number;
    if (n < lo || n > hi || (open && n === lo))
      invalidStep(at, `${n} is outside ${open ? '(' : '['}${lo}, ${hi}]`, 'pass a value in range');
    return n;
  };
const int =
  (lo: number, hi: number): Check =>
  (v, at) => {
    const n = num(lo, hi)(v, at) as number;
    if (!Number.isInteger(n)) invalidStep(at, `${n} is not an integer`, 'pass a whole number');
    return n;
  };
const bool: Check = (v, at) =>
  typeof v === 'boolean' ? v : invalidStep(at, `${String(v)} is not a boolean`, 'pass true/false');
const oneOf =
  (...names: readonly string[]): Check =>
  (v, at) =>
    typeof v === 'string' && names.includes(v)
      ? v
      : invalidStep(at, `'${String(v)}' is not one of ${names.join(', ')}`, 'use a listed value');
const list =
  (item: Check, min: number, max: number): Check =>
  (v, at) => {
    if (!Array.isArray(v) || v.length < min || v.length > max)
      invalidStep(at, `needs ${min}..${max} entries`, 'pass an array of that length');
    return (v as unknown[]).map((x, i) => item(x, `${at}[${i}]`));
  };
const vec3 = list(num(), 3, 3);
const boneName: Check = (v, at) =>
  typeof v === 'string' && /^[a-z][a-z0-9_]*$/.test(v)
    ? v
    : invalidStep(at, `'${String(v)}' is not a bone name`, "use the skeleton's snake_case names");
const shape =
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

const req = (check: Check): Field => ({ check, required: true });
const opt = (check: Check, def?: unknown): Field => ({ check, def });

const mask: Check = (v, at) => {
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
const weightMask: Check = (v, at) => {
  const kind = (v as { kind?: unknown } | null)?.kind;
  const feather = opt(num(0), 0);
  if (kind === 'box')
    return shape({ kind: req(oneOf('box')), min: req(vec3), max: req(vec3), feather })(v, at);
  if (kind === 'plane') {
    const p = shape({ kind: req(oneOf('plane')), point: req(vec3), normal: req(vec3), feather })(
      v,
      at,
    ) as { normal: number[] };
    if (Math.hypot(...p.normal) < 1e-9)
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
const text =
  (max: number): Check =>
  (v, at) => {
    if (typeof v !== 'string' || v.trim() === '' || v.length > max)
      invalidStep(at, `is not a non-empty string of at most ${max} characters`, 'pass the text');
    return v;
  };
const unique =
  (item: Check, max: number): Check =>
  (v, at) => {
    const m = list(item, 1, max)(v, at) as string[];
    if (new Set(m).size !== m.length) invalidStep(at, 'names an entry twice', 'list each once');
    return m;
  };
const maps: Check = (v, at) => {
  const m = list(oneOf('albedo', 'normal', 'ao', 'roughness'), 1, 4)(v, at) as string[];
  if (new Set(m).size !== m.length) invalidStep(at, 'names a map twice', 'list each map once');
  return m;
};
const lodTriangles: Check = (v, at) => {
  const t = list(int(4, 10_000_000), 1, 2)(v, at) as number[];
  if (t.length === 2 && (t[1] ?? 0) >= (t[0] ?? 0))
    invalidStep(at, `[${t.join(', ')}] does not fall`, 'give lod1 then a smaller lod2');
  return t;
};
const focus = list(
  shape({ at: req(vec3), r: req(num(0, 1e6, true)), weight: req(num(1, 16)) }),
  1,
  32,
);
const size = int(16, 8192);
const pos = num(0, 1e6, true);

const FIELDS: Readonly<Record<string, Readonly<Record<string, Field>>>> = {
  transform: { matrix: req(list(num(), 16, 16)) },
  clean: {
    weld: opt(num(0, 1), 1e-5),
    minShell: opt(num(0, 1), 0.002),
    fillHoles: opt(int(0, 100_000), 64),
    manifold: opt(bool, true),
  },
  symmetrize: { axis: opt(oneOf('x', 'y', 'z'), 'y'), side: opt(oneOf('+', '-'), '+') },
  amputate: {
    limbs: req(list(list(shape({ head: req(vec3), tail: req(vec3), r: req(pos) }), 1, 64), 1, 32)),
  },
  repose: {
    to: req(list(shape({ name: req(boneName), head: req(vec3), tail: req(vec3) }), 1, 256)),
    mirror: opt(oneOf('+', '-')),
    mirrorLimit: opt(pos, 0.05),
  },
  unweb: {
    limbs: req(list(list(shape({ head: req(vec3), tail: req(vec3), r: req(pos) }), 1, 64), 2, 32)),
    gap: opt(pos, 0.02),
  },
  voxelRemesh: { voxel: req(pos), adaptivity: opt(num(0, 1), 0) },
  smooth: {
    iterations: req(int(1, 200)),
    factor: req(num(0, 10, true)),
    kind: opt(oneOf('laplacian', 'corrective'), 'laplacian'),
  },
  displace: {
    strength: req(num()),
    scale: req(pos),
    kind: opt(oneOf('noise', 'voronoi', 'musgrave'), 'noise'),
    seed: opt(int(0, 0x7fffffff), 0),
    mask: opt(mask),
  },
  inflate: { distance: req(num()), mask: opt(mask) },
  skinBody: {
    bones: req(
      list(shape({ head: req(vec3), tail: req(vec3), r0: req(pos), r1: req(pos) }), 1, 256),
    ),
    subdiv: opt(int(0, 4), 2),
  },
  metaballs: {
    balls: req(
      list(
        shape({
          at: req(vec3),
          r: req(pos),
          stiffness: opt(num(0, 10), 2),
          negative: opt(bool, false),
        }),
        1,
        1024,
      ),
    ),
    resolution: req(pos),
  },
  retopo: {
    strategy: opt(oneOf('shell', 'decimate'), 'shell'),
    reduce: opt(oneOf('decimate', 'quadriflow'), 'decimate'),
    triangles: req(int(4, 10_000_000)),
    voxel: opt(pos),
    close: opt(num(0, 16)),
    skin: opt(num(0, 2)),
    smooth: opt(int(0, 50), 0),
    preserveSymmetry: opt(bool, false),
    focus: opt(focus),
  },
  uv: {
    kind: opt(oneOf('smart', 'unwrap'), 'smart'),
    angle: opt(num(0, 1.553, true), 1.45),
    margin: opt(num(0, 0.1), 0.003),
    smooth: opt(int(0, 500), 30),
  },
  bake: {
    size: opt(size, 2048),
    maps: opt(maps, ['albedo', 'normal']),
    cage: opt(pos),
    maxRay: opt(pos),
    samples: opt(int(1, 1024), 1),
    aoSamples: opt(int(1, 1024), 32),
    margin: opt(int(0, 64), 16),
  },
  bind: {
    from: opt(oneOf('skeleton', 'source'), 'skeleton'),
    maxInfluences: opt(int(1, 8), 4),
    proxyVoxel: opt(pos),
  },
  joint: { bone: req(text(63)), head: opt(vec3), tail: opt(vec3) },
  weights: {
    kind: req(oneOf('assign', 'smooth', 'scale')),
    bone: req(text(63)),
    mask: req(weightMask),
    value: opt(num(0, 100), 1),
    iterations: opt(int(1, 100), 2),
  },
  isolate: {
    bones: req(list(text(63), 1, 32)),
    from: req(vec3),
    point: req(vec3),
    normal: req(vec3),
    r: req(pos),
    feather: opt(pos, 0.03),
    maxShare: opt(num(0, 1, true), 0.25),
  },
  script: { python: req(text(65_536)), why: req(text(400)) },
  review: {
    views: opt(unique(oneOf('clay', 'wire', 'weights', 'poses', 'turnaround'), 5), [
      'clay',
      'wire',
    ]),
    size: opt(int(64, 4096), 1024),
    poses: opt(
      list(
        shape({
          bone: req(text(63)),
          axis: req(oneOf('x', 'y', 'z')),
          degrees: req(num(-360, 360)),
        }),
        1,
        16,
      ),
    ),
  },
  lods: { triangles: req(lodTriangles), focus: opt(focus) },
  export: { albedoSize: opt(size), normalSize: opt(size), ormSize: opt(size) },
};

/** Every op the program knows, in table order. */
export const BLENDER_OPS: readonly string[] = Object.keys(FIELDS);

/** One step checked and with its defaults filled; `index` only names it in errors. */
export function normaliseStep(step: unknown, index: number): Readonly<Record<string, unknown>> {
  const op = (step as { op?: unknown } | null)?.op;
  if (typeof op !== 'string' || !Object.hasOwn(FIELDS, op))
    invalidStep(
      `step ${index}`,
      `unknown op '${String(op)}'`,
      `use one of: ${BLENDER_OPS.join(', ')}`,
    );
  const name = op as string;
  const fields = { op: req(oneOf(name)), ...FIELDS[name] };
  return shape(fields)(step, `step ${index} (${name})`) as Readonly<Record<string, unknown>>;
}
