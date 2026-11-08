// Body: the torso sculpt fused with the neck, both legs, the wing shoulders and the tail stump into
// ONE mirrored sculpt so every join is a smooth blend; claws and the dorsal spine row are meshed
// separately and merged in; the wing sockets are split off as their own parts (shoulder.ts).
// Sculpted in stages:
//   block-out  chest barrel, ribcage, tucked waist, hips (separate masses, generous blends)
//   planes     flattened flanks, the belly line, a level back
//   features   pectorals, ribcage + costal arch, hip bones, sacrum, tail-root muscles
//   creases    flank fold behind the ribs, the thigh crease, the pectoral line, serratus, navel
// Scales and belly plates come from scales.ts as relief + paint.

import {
  type Field,
  type Mesh,
  merge,
  type SculptEdit,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { spline } from '../_lib/creature/curve.ts';
import { hit } from '../_lib/creature/probe.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { skin, tube } from '../_lib/creature/skin.ts';
import { clawMesh, legEdits, legsLowpoly } from './legs.ts';
import { tailRadius } from './lines.ts';
import { neckEdits } from './neck.ts';
import { C } from './palette.ts';
import { bodyPaint, bodyRelief } from './scales.ts';
import {
  shoulderEdits,
  socketBounds,
  socketLowpoly,
  socketRegion,
  socketsRegion,
} from './shoulder.ts';
import { SK, TAIL_PIVOT } from './skeleton.ts';
import { spineMesh } from './spines.ts';

type E3 = readonly [number, number, number];

/** Block-out: the four torso masses. */
function blockOut(): SculptEdit[] {
  const m = (s: { at: E3; r: E3 }): SculptEdit => ({
    shape: 'ellipsoid',
    at: s.at,
    size: s.r,
    blend: 0.36,
  });
  return [m(SK.chest), m(SK.ribs), m(SK.waist), m(SK.hips)];
}

/** Planes: scrape the flanks flat, level the back, cut a clean belly line with a waist tuck. */
function planes(): SculptEdit[] {
  return [
    {
      shape: 'roundBox',
      at: [-0.2, 0.86, 1.55],
      size: [1.8, 0.6, 1.4],
      round: 0.1,
      op: 'subtract',
      blend: 0.18,
    },
    {
      shape: 'roundBox',
      at: [-0.2, 0, 2.62],
      size: [2.6, 1.4, 0.7],
      round: 0.1,
      op: 'subtract',
      blend: 0.2,
    },
    {
      shape: 'roundBox',
      at: [-0.55, 0, 0.62],
      size: [1.1, 1.4, 0.9],
      rotate: [0, -6, 0],
      op: 'subtract',
      blend: 0.25,
    },
  ];
}

/** Features: the bony landmarks and big muscle groups a viewer reads the anatomy from. */
function features(): SculptEdit[] {
  return [
    // Pectorals: a deep keel of chest jutting forward between the forelegs.
    {
      shape: 'ellipsoid',
      at: [1.3, 0.26, 1.4],
      size: [0.42, 0.28, 0.4],
      rotate: [0, -20, 0],
      blend: 0.18,
    },
    {
      shape: 'ellipsoid',
      at: [1.38, 0, 1.18],
      size: [0.36, 0.24, 0.3],
      blend: 0.2,
      color: C.belly,
    },
    // Ribcage: the widest point behind the shoulders, its lower edge (costal arch) as a ridge.
    { shape: 'ellipsoid', at: [0.12, 0.3, 1.6], size: [0.62, 0.26, 0.46], blend: 0.22 },
    skin(
      [
        { at: [0.6, 0.34, 1.14], r: 0.07 },
        { at: [0.1, 0.42, 1.24], r: 0.075 },
        { at: [-0.35, 0.4, 1.4], r: 0.065 },
      ],
      { blend: 0.1 },
    ),
    // Belly: soft, under the ribcage, cream.
    {
      shape: 'ellipsoid',
      at: [-0.05, 0, 1.2],
      size: [0.72, 0.38, 0.3],
      blend: 0.25,
      color: C.belly,
    },
    // Hip bones (ilium) as two knobs on the croup, and the sacrum ridge between them.
    {
      shape: 'ellipsoid',
      at: [-1.02, 0.3, 2.06],
      size: [0.26, 0.13, 0.12],
      rotate: [0, 0, -15],
      blend: 0.12,
    },
    { shape: 'capsule', at: [-0.95, 0, 2.08], to: [-1.6, 0, 1.94], size: 0.1, blend: 0.12 },
    // Tail-root muscles flowing from the croup into the stump.
    {
      shape: 'ellipsoid',
      at: [-1.65, 0.2, 1.62],
      size: [0.42, 0.2, 0.3],
      rotate: [0, 20, 0],
      blend: 0.16,
    },
    // Back ridge: the spine as a raised line along the top.
    skin(
      tube(spline(SK.spine.slice(3), 4), () => 0.1),
      { blend: 0.14, color: C.back },
    ),
    // Tail stump: the first span of the tail, blended into the hips; the tail part plugs into it.
    skin(
      tube(
        [SK.hips.at, [-1.6, 0, 1.64], TAIL_PIVOT, [-2.3, 0, 1.3]],
        (t) => tailRadius(0) * (1.12 - 0.18 * t),
      ),
      { blend: 0.22 },
    ),
  ];
}

/** A carved fold: a capsule from `a` to `b`, radius `r`, subtracted with a blend of 1.2 r. */
export interface Groove {
  readonly name: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly r: number;
  readonly why: string;
}

/** The body's carved folds (left side; the sculpt mirrors). creases.ts declares the same lines. */
export const GROOVES: readonly Groove[] = [
  {
    name: 'flank_fold',
    a: [-0.55, 0.47, 1.25],
    b: [-0.7, 0.44, 1.75],
    r: 0.03,
    why: 'flank fold behind the ribcage, where the belly meets the thigh',
  },
  {
    name: 'pectoral',
    a: [1.25, 0.42, 1.0],
    b: [0.9, 0.55, 1.3],
    r: 0.028,
    why: 'pectoral line under the chest, between the keel and the foreleg',
  },
  {
    name: 'thigh',
    a: [-0.85, 0.55, 1.05],
    b: [-0.92, 0.55, 1.6],
    r: 0.028,
    why: 'thigh crease at the front of the haunch',
  },
  // Serratus: three short slanted grooves on the ribcage, the stylised "ribs". Wider than a
  // sculpt cell and riding a little proud, so they read as soft grooves: 2.2 cm grooves aliased
  // into 95° notches at the 4.4 cm LOD0 cell (QA connections seam).
  ...[0, 1, 2].map(
    (i): Groove => ({
      name: `serratus_${i}`,
      a: [0.45 - i * 0.28, 0.555 - i * 0.02, 1.32],
      b: [0.3 - i * 0.28, 0.515 - i * 0.02, 1.72],
      r: 0.034,
      why: 'carved serratus groove on the ribcage (the stylised ribs)',
    }),
  ),
  {
    name: 'navel',
    a: [-0.62, 0.3, 1.08],
    b: [-0.85, 0.36, 1.18],
    r: 0.04,
    why: 'navel groove between the belly and the hind legs',
  },
];

/** Creases: the folds that make the forms read (subtractive, narrow, small blend). */
function creases(): SculptEdit[] {
  return GROOVES.map((g) => ({
    shape: 'capsule',
    at: g.a,
    to: g.b,
    size: g.r,
    op: 'subtract',
    blend: g.r * 1.2,
  }));
}

/** Every edit of the body sculpt at this LOD (left side; the sculpt mirrors). `fold` adds the
 *  skin fold the wing membrane roots in (off for the probe field that places it). */
export function bodyEdits(lod: number, fold = true): SculptEdit[] {
  const legs = lod < 2 ? legEdits(lod) : [];
  const skinFold: SculptEdit[] =
    fold && lod < 2
      ? [
          skin(
            flankLine(0.01).map((at) => ({ at, r: 0.035 })),
            { blend: 0.1 },
          ),
        ]
      : [];
  return [
    ...blockOut(),
    ...planes(),
    ...features(),
    ...shoulderEdits(lod),
    ...neckEdits(lod),
    ...legs,
    ...(lod < 2 ? creases() : []),
    ...skinFold,
    // Flat pads: paws and toes rest flat on the ground.
    { shape: 'roundBox', at: [0, 0, -0.5], size: [12, 12, 1.008], op: 'subtract', blend: 0.01 },
  ];
}

/** The body's plain sculpt field (folded |y|), for probes: membrane roots, sockets. */
export function bodyField(lod: number): Field {
  const f = sculptField(bodyEdits(lod, false), { color: C.flank }).field;
  return (p) => f([p[0], Math.abs(p[1]), p[2]]);
}

/** Where the wing membrane meets the body (left): probed on the flank from the shoulder down to
 *  the front of the thigh, then sunk `bury` metres into the skin. */
export function flankLine(bury: number): Vec3[] {
  const f = bodyField(1);
  const at = (x: number, z: number): Vec3 => {
    const p = hit(f, [x, 1.4, z], [0, -1, 0], 1.4) ?? [x, 0.4, z];
    return [p[0], p[1] - bury, p[2]];
  };
  return [at(0.15, 2.08), at(-0.3, 1.98), at(-0.72, 1.82), at(-0.98, 1.5)];
}

/** Sculpt cell per LOD (metres). */
export const BODY_RES = [0.044, 0.085, 0.25] as const;

export interface BodyMeshes {
  readonly body: Mesh;
  /** Wing sockets, left and right (static parts the wings articulate on). */
  readonly sockets: readonly [Mesh, Mesh];
}

export function bodyMesh(lod: 0 | 1 | 2): BodyMeshes {
  const common = {
    edits: bodyEdits(lod),
    res: BODY_RES[lod],
    color: C.flank,
    mirror: true,
    tone: { reach: 0.12, ground: 0.6 },
    paint: bodyPaint(lod),
    ...(lod === 0 ? { relief: bodyRelief() } : {}),
  };
  const spines = spineMesh(lod, 'body');
  if (lod === 2) {
    const main = sculptPart(common);
    return {
      body: merge([main.mesh, legsLowpoly(), spines]),
      sockets: [socketLowpoly(1), socketLowpoly(-1)],
    };
  }
  const main = sculptPart({ ...common, cut: { field: socketsRegion(0), keep: 'out' } });
  const socket = (side: 1 | -1): Mesh =>
    sculptPart({
      ...common,
      cut: { field: socketRegion(0.02, side), keep: 'in' },
      clip: socketBounds(side),
      snap: false,
    }).mesh;
  return {
    body: merge([main.mesh, clawMesh(lod), spines]),
    sockets: [socket(1), socket(-1)],
  };
}
