// Horns, spikes and crests of the five heads. Each is described once for the +Y side, then seated on
// the skull's real surface: the root is sunk under it, and the skull grows a boss round the root so
// the horn rises out of bone instead of being stood on it.

import type { Field, Mesh, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { type HornOptions, horn, hornBand, hornNodes } from '../_lib/creature/horn.ts';
import { tubeMesh } from '../_lib/creature/lowpoly.ts';
import { pinKeratin } from './material.ts';
import { C } from './skin.ts';

export type Ornament = 'swept' | 'nasal' | 'crest' | 'frill' | 'curled';

export interface HornSpec {
  readonly base: Vec3;
  readonly dir: Vec3;
  readonly length: number;
  readonly radius: number;
  readonly axis: Vec3;
  readonly bend: number;
  readonly spiral?: number;
  readonly rings?: number;
  readonly ringDepth?: number;
}

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const along = (o: Vec3, d: Vec3, k: number): Vec3 => [
  o[0] + d[0] * k,
  o[1] + d[1] * k,
  o[2] + d[2] * k,
];
const row = (n: number, f: (t: number) => HornSpec): HornSpec[] =>
  Array.from({ length: n }, (_, i) => f(i / Math.max(1, n - 1)));

/** The horns of one head for the +Y side and the midline; fewer of them far away. */
export function hornSpecs(ornament: Ornament, snout: number, lod: number): HornSpec[] {
  switch (ornament) {
    case 'swept':
      return [
        {
          base: [-0.01, 0.092, 0.135],
          dir: [-0.8, 0.28, 0.42],
          length: 0.68,
          radius: 0.05,
          axis: [0.3, 0.2, 1],
          bend: 38,
          rings: 9,
          ringDepth: 0.08,
        },
        ...(lod < 2
          ? [
              {
                base: [0.08, 0.105, 0.118] as Vec3,
                dir: [-0.7, 0.5, 0.45] as Vec3,
                length: 0.15,
                radius: 0.018,
                axis: [0, 0, 1] as Vec3,
                bend: 25,
              },
            ]
          : []),
      ];
    case 'nasal':
      return [
        {
          base: [snout, 0, 0.066],
          dir: [0.28, 0, 1],
          length: 0.24,
          radius: 0.042,
          axis: [0, 1, 0],
          bend: -28,
        },
        ...row(lod < 2 ? 2 : 1, (t) => ({
          base: [0.14 - t * 0.13, 0.102 - t * 0.012, 0.128 - t * 0.012],
          dir: [-0.42, 0.45, 0.72],
          length: 0.17 - t * 0.05,
          radius: 0.024,
          axis: [0, 0, 1],
          bend: 20,
        })),
      ];
    case 'crest':
      return row(lod === 2 ? 3 : 5, (t) => ({
        base: [0.2 - t * 0.28, 0, 0.142 - t * t * 0.05],
        dir: [-0.5, 0, 0.86],
        length: (0.3 - Math.abs(t - 0.34) * 0.26) * 1.05,
        radius: 0.03,
        axis: [0, 1, 0],
        bend: 24,
      }));
    case 'frill':
      return row(lod === 2 ? 2 : 4, (t) => {
        const a = 0.2 + t * 1.25;
        return {
          base: [-0.02, 0.09 + dmath.cos(a) * 0.035, 0.04 + dmath.sin(a) * 0.09],
          dir: [-0.75, dmath.cos(a) * 0.72, dmath.sin(a) * 0.62 + 0.1],
          length: 0.3 - t * 0.05,
          radius: 0.026,
          axis: [0, 0, 1],
          bend: 16,
        };
      });
    case 'curled':
      return [
        {
          base: [0.02, 0.1, 0.122],
          dir: [-0.3, 0.4, 0.86],
          length: 0.82,
          radius: 0.056,
          axis: [0.15, 0.95, -0.15],
          bend: 190,
          spiral: 0.3,
          rings: 13,
          ringDepth: 0.1,
        },
      ];
  }
}

export interface SeatedHorn {
  readonly spec: HornSpec;
  /** Where the horn's axis leaves the skull. */
  readonly surface: Vec3;
  readonly dir: Vec3;
}

/** How deep a root goes, in root radii. */
const ROOT_DEPTH = 1.4;

/** Moves a horn along its axis onto the skull's surface and sinks its root. */
export function seat(spec: HornSpec, skull: Field): SeatedHorn {
  const dir = unit(spec.dir);
  let surface = spec.base;
  let before = skull(along(spec.base, dir, -0.2));
  for (let t = -0.196; t <= 0.2; t += 0.004) {
    const p = along(spec.base, dir, t);
    const f = skull(p);
    if (before < 0 && f >= 0) {
      surface = p;
      break;
    }
    before = f;
  }
  const sink = spec.radius * ROOT_DEPTH;
  return {
    spec: { ...spec, base: along(surface, dir, -sink), dir, length: spec.length + sink },
    surface,
    dir,
  };
}

/** The boss a seated horn rises from, blended into the skull. */
export const bossEdit = (h: SeatedHorn, color: Vec3): SculptEdit => ({
  shape: 'roundCone',
  at: along(h.surface, h.dir, -h.spec.radius * 0.6),
  // It narrows past the horn's own width, so the horn leaves its flank at a shallow angle.
  to: along(h.surface, h.dir, h.spec.radius * 1.7),
  size: [h.spec.radius * 1.9, h.spec.radius * 0.8],
  color,
  blend: Math.max(0.03, h.spec.radius * 1.5),
});

const COLOURS: readonly [Vec3, Vec3, Vec3] = [C.horn, C.hornMid, C.hornTip];

/** Spikes this thin are grown into the skull's own sculpt at LOD0, where its cells can hold them. */
export const SCULPTED_BELOW = 0.035;

export const isSculpted = (h: SeatedHorn, lod: number): boolean =>
  lod === 0 && h.spec.radius < SCULPTED_BELOW;

/** A thin spike as a sculpt edit: it blends out of the skull with no root line at all. */
export const spikeEdit = (h: SeatedHorn): SculptEdit =>
  horn({
    ...h.spec,
    tip: 0.006,
    segments: 10,
    colors: COLOURS,
    // Wide enough that the fillet stays a curve and not a crease line.
    blend: 0.058,
  });

/** The horn's tube, swelling where it leaves the skull so bone runs into horn with no hard ring. */
function flaredTube(o: HornOptions, surfaceAt: number, sides: number, keep = 1): Mesh {
  const nodes = hornNodes(o);
  const n = nodes.length - 1;
  const band = hornBand(o.colors);
  const flared = nodes.map((node, i) => {
    const d = ((i / n) * o.length - surfaceAt) / (o.radius * 1.5);
    return { ...node, r: node.r * (1 + 0.7 * dmath.exp(-d * d)) };
  });
  // A chipped horn ends in a blunt break, the fresh keratin there paler than the weathered sheath.
  const last = Math.max(2, Math.round(n * keep));
  const colors = nodes.map((_, i) => (keep < 1 && i >= last - 1 ? BREAK : band(i, n)));
  const tube = tubeMesh(flared.slice(0, last + 1), { sides, colors: colors.slice(0, last + 1) });
  return pinKeratin(tube, o.base, o.dir, o.length);
}

/** Fresh keratin at a break: pale, not yet darkened by weather. */
const BREAK: Vec3 = [0.62, 0.56, 0.44];

/** A seated horn as mesh; off the midline it comes with its mirror twin. */
export function hornMeshes(h: SeatedHorn, lod: number, chipped = false): Mesh[] {
  // Far away a horn pair stays a pair of real cones: enough segments to keep the sweep or the curl.
  // LOD1 is a pentagon in section (a 3 cm horn's sixth side is under a pixel at that range).
  const sides = [10, 5, 5][lod] ?? 5;
  const segments = [18, 6, 4][lod] ?? 4;
  const o: HornOptions = { ...h.spec, segments, colors: COLOURS };
  // The boss lifts the skull round the root: the horn leaves it about a radius past the bone.
  const sink = h.spec.radius * (ROOT_DEPTH + 1.2);
  const m = flaredTube(o, sink, sides);
  if (Math.abs(o.base[1]) < 1e-6) return [m];
  const flip = (v: Vec3): Vec3 => [v[0], -v[1], v[2]];
  const axis: Vec3 = [-o.axis[0], o.axis[1], -o.axis[2]];
  const twin = { ...o, base: flip(o.base), dir: flip(o.dir), axis };
  return [m, flaredTube(twin, sink, sides, chipped ? 0.66 : 1)];
}
