// Groom ops: Blender's hair sculpt brushes as a declarative, deterministic edit list (comb, puff,
// cut, grow, shrink, pinch, clump, curl, frizz, smooth, density, slide, add, delete), applied in
// order like sculpt edits. Each op may carry a `region` (a named scalp zone or a field, ≤ 0 where
// it acts) and a `seed` where it draws. This file owns the types, validation (T3D_RECIPE_INVALID)
// and the per-guide masks; groom-ops-apply.ts edits the guide curves. Stages: `guide` ops shape
// the guides here (children inherit them), `strand` ops (pinch, clump, curl, frizz) act on the
// dense child strands in Blender's groom task and on the guides only for the CPU tier.

import { dmath, Ts23dError, type Vec3 } from '../core/index.ts';

/** Negative where an op acts: a scalp zone (crown, nape, fringe…) or a landmark mask. */
export type GroomField = (p: Vec3) => number;
export type GroomRegion = string | GroomField;

/** One guide curve: `points[0]` is the (buried) root, `normal` the scalp normal there. */
export interface GroomGuide {
  readonly points: readonly Vec3[];
  readonly normal: Vec3;
}

interface OpBase {
  readonly region?: GroomRegion;
}
export type GroomOp = OpBase &
  (
    | { readonly op: 'comb'; readonly toward: Vec3; readonly strength: number }
    | { readonly op: 'puff'; readonly amount: number }
    | {
        readonly op: 'cut';
        readonly length?: number;
        readonly plane?: { readonly at: Vec3; readonly normal: Vec3 };
      }
    | { readonly op: 'grow' | 'shrink'; readonly factor: number }
    | {
        readonly op: 'pinch' | 'clump';
        readonly locks: number;
        readonly strength: number;
        readonly seed?: number;
      }
    | {
        readonly op: 'curl';
        readonly radius: number;
        readonly turns: number;
        readonly seed?: number;
      }
    | { readonly op: 'frizz'; readonly amount: number; readonly seed?: number }
    | { readonly op: 'smooth'; readonly iterations: number }
    | { readonly op: 'density'; readonly perCm2: number }
    | { readonly op: 'slide'; readonly by: Vec3 }
    | { readonly op: 'add'; readonly count: number; readonly seed?: number }
    | { readonly op: 'delete'; readonly fraction?: number; readonly seed?: number }
  );
export type GroomOpName = GroomOp['op'];

/** Ops Blender's groom task applies to the child strands; the rest shape the guides in TS. */
export const STRAND_OPS: readonly GroomOpName[] = ['pinch', 'clump', 'curl', 'frizz'];
export const isStrandOp = (op: GroomOp): boolean => STRAND_OPS.includes(op.op);

const bad = (i: number, op: string, cause: string, fix: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause: `groom op ${i} (${op}): ${cause}`, fix });
};
const finite = (v: Vec3): boolean => v.every(Number.isFinite);
const inRange = (v: number, lo: number, hi: number): boolean =>
  Number.isFinite(v) && v >= lo && v <= hi;

/** Throws T3D_RECIPE_INVALID on the first op whose numbers, zone or seed are out of range. */
export function checkGroomOps(
  ops: readonly GroomOp[],
  zones: Readonly<Record<string, GroomField>> = {},
): void {
  ops.forEach((o, i) => {
    const no = (cause: string, fix: string): never => bad(i, o.op, cause, fix);
    if (typeof o.region === 'string' && !zones[o.region])
      no(
        `region '${o.region}' is not a zone`,
        `name one of: ${Object.keys(zones).join(', ') || '(no zones given)'} or pass a field`,
      );
    if ('seed' in o && o.seed !== undefined && !Number.isInteger(o.seed))
      no(`seed ${o.seed}`, 'use an integer seed');
    switch (o.op) {
      case 'comb':
        if (!finite(o.toward) || dmath.norm(o.toward) < 1e-9 || !inRange(o.strength, 0, 1))
          no(`toward [${o.toward}], strength ${o.strength}`, 'a non-zero direction, strength 0..1');
        return;
      case 'puff':
        if (!inRange(o.amount, 0, 1)) no(`amount ${o.amount}`, 'amount is 0..1 (1 = upright)');
        return;
      case 'cut':
        if (o.length === undefined && o.plane === undefined)
          no('neither length nor plane', 'cut to a length (metres) or by a plane { at, normal }');
        if (o.length !== undefined && !inRange(o.length, 1e-3, 2))
          no(`length ${o.length}`, 'length is 1 mm..2 m');
        if (
          o.plane &&
          (!finite(o.plane.at) || !finite(o.plane.normal) || dmath.norm(o.plane.normal) < 1e-9)
        )
          no(
            `plane at [${o.plane.at}], normal [${o.plane.normal}]`,
            'give the plane a finite point and a finite non-zero normal (kept side < 0)',
          );
        return;
      case 'grow':
        if (!inRange(o.factor, 1, 10)) no(`factor ${o.factor}`, 'grow by a factor 1..10');
        return;
      case 'shrink':
        if (!inRange(o.factor, 0.05, 1)) no(`factor ${o.factor}`, 'shrink by a factor 0.05..1');
        return;
      case 'pinch':
      case 'clump':
        if (!(Number.isInteger(o.locks) && o.locks >= 1) || !inRange(o.strength, 0, 1))
          no(
            `locks ${o.locks}, strength ${o.strength}`,
            'locks is a whole number ≥ 1, strength 0..1',
          );
        return;
      case 'curl':
        if (!inRange(o.radius, 1e-4, 0.1) || !inRange(o.turns, 0.05, 50))
          no(`radius ${o.radius}, turns ${o.turns}`, 'radius 0.1 mm..10 cm, turns 0.05..50');
        return;
      case 'frizz':
        if (!inRange(o.amount, 0, 0.05)) no(`amount ${o.amount}`, 'amount is 0..5 cm');
        return;
      case 'smooth':
        if (!(Number.isInteger(o.iterations) && o.iterations >= 1 && o.iterations <= 100))
          no(`iterations ${o.iterations}`, 'iterations is a whole number 1..100');
        return;
      case 'density':
        if (!inRange(o.perCm2, 0.01, 2000)) no(`perCm2 ${o.perCm2}`, 'strands per cm² 0.01..2000');
        return;
      case 'slide':
        if (!finite(o.by) || dmath.norm(o.by) > 0.1) no(`by [${o.by}]`, 'slide ≤ 10 cm');
        return;
      case 'add':
        if (!(Number.isInteger(o.count) && o.count >= 1 && o.count <= 10000))
          no(`count ${o.count}`, 'add 1..10000 guides');
        return;
      case 'delete':
        if (o.region === undefined && o.fraction === undefined)
          no('no region and no fraction', 'delete inside a region, or a random fraction');
        if (o.fraction !== undefined && !inRange(o.fraction, 0, 1))
          no(`fraction ${o.fraction}`, 'fraction is 0..1');
        return;
    }
  });
}

/** Width of a region mask's soft edge, metres, centred on the boundary: weight 1 from half of it
 *  inside, ½ on the boundary, 0 from half of it outside. */
const SOFT = 0.004;

/** The op's weight per guide (0..1) from its region at each root: 1 at 2 mm or more inside, ½
 *  on the boundary, 0 at 2 mm or more outside (linear between); 1 everywhere without a region. */
export function opMask(
  op: GroomOp,
  guides: readonly GroomGuide[],
  zones: Readonly<Record<string, GroomField>> = {},
): number[] {
  const f = typeof op.region === 'string' ? zones[op.region] : op.region;
  if (!f) return guides.map(() => 1);
  return guides.map((g) => {
    const d = f(g.points[0] ?? [0, 0, 0]);
    return Math.min(1, Math.max(0, 0.5 - d / SOFT));
  });
}

/** Child strands per guide that a `density` op asks for over `areaM2` of scalp (last one wins). */
export function childrenFor(
  ops: readonly GroomOp[],
  guides: number,
  areaM2: number,
  fallback: number,
): number {
  const d = [...ops].reverse().find((o) => o.op === 'density');
  if (d?.op !== 'density' || guides === 0) return fallback;
  return Math.max(1, Math.round((d.perCm2 * areaM2 * 1e4) / guides));
}
