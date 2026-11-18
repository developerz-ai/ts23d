// The field table of the Blender step program (blender-steps.ts): per op, every field with its
// check and default. `normaliseStep` refuses unknown ops, unknown fields, missing required fields
// and non-finite or out-of-range numbers (T3D_RECIPE_INVALID naming the step index), and fills the
// defaults, so the canonical JSON — and with it the cache key — holds every value Blender will use.
// An optional field added to an existing op has NO default: a default would change the canonical
// bytes, and so the request key, of every committed program.

import {
  boneName,
  bool,
  type Field,
  focus,
  int,
  invalidStep,
  list,
  lodTriangles,
  maps,
  mask,
  num,
  oneOf,
  opt,
  pos,
  req,
  shape,
  size,
  text,
  unique,
  vec3,
  weightMask,
} from './blender-step-checks.ts';
import { STROKE_FIELDS } from './blender-step-stroke.ts';

export { invalidStep } from './blender-step-checks.ts';

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
  stroke: STROKE_FIELDS,
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
    cageFit: opt(bool),
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
