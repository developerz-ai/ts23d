// Tail: a heavy, tapering skin that leaves the hips, sweeps down and curls left along the ground,
// ending in a spade (a central blade and two swept-back flukes, pressed flat). Its own part,
// pivoted inside the body's tail stump so an engine (or the baked sway) can swish it. Built in
// world space, then moved into the pivot's frame. Far LOD: a swept tube and three-sided blades.

import {
  type Mesh,
  merge,
  place,
  type SculptEdit,
  sculptField,
  type Vec3,
} from '@developerz.ai/ts23d';
import { pointAt, resample, tangentAt, v3 } from '../_lib/creature/curve.ts';
import { type HornOptions, horn, hornNodes } from '../_lib/creature/horn.ts';
import { skinTube } from '../_lib/creature/lowpoly.ts';
import { sculptPart } from '../_lib/creature/sculpt-part.ts';
import { skin, tube } from '../_lib/creature/skin.ts';
import { tailPath, tailRadius } from './lines.ts';
import { C, HORN } from './palette.ts';
import { tailPaint, tailRelief } from './scales.ts';
import { TAIL_PIVOT } from './skeleton.ts';
import { spineMesh } from './spines.ts';
import { tailStamps } from './stamps.ts';

/** The spade's three blades (world space). */
function spadeSpecs(segments: number): HornOptions[] {
  const path = tailPath();
  const tip = pointAt(path, 1);
  const dir = tangentAt(path, 0.98);
  const side = v3.norm(v3.cross([0, 0, 1], dir));
  const blade = (o: Omit<HornOptions, 'segments' | 'colors' | 'taper' | 'tip'>): HornOptions => ({
    ...o,
    segments,
    colors: HORN,
    taper: 1.1,
    tip: 0.01,
  });
  return [
    blade({
      base: v3.sub(tip, v3.mul(dir, 0.05)),
      dir,
      length: 0.95,
      radius: 0.31,
      axis: [0, 0, 1],
      bend: 10,
    }),
    ...[1, -1].map((s) =>
      blade({
        base: v3.add(tip, v3.mul(dir, 0.06)),
        // Swept back only a little: a longer fluke lying along the tail left a groove there.
        dir: v3.norm(v3.add(v3.mul(side, s), v3.mul(dir, -0.22))),
        length: 0.8,
        radius: 0.22,
        axis: [0, 0, s],
        bend: -40 * s,
      }),
    ),
  ];
}

/** Spade blades pressed flat (a 5 cm slab), as sculpt groups. */
function spade(lod: number): SculptEdit[] {
  const tip = pointAt(tailPath(), 1);
  return spadeSpecs([8, 5, 3][lod] ?? 3).map((o) => ({
    group: [
      horn(o),
      // A slab as thick as the coarse cell holds (7 cm at LOD0, 12 at LOD1).
      {
        shape: 'roundBox',
        at: tip,
        size: [2.4, 2.4, lod === 0 ? 0.07 : 0.12],
        op: 'intersect',
        round: 0.028,
      },
    ],
    // Fillet where the blades leave the tail tip (0.07 left a hard valley under the wider
    // flukes: QA connections).
    blend: 0.1,
  }));
}

export function tailEdits(lod: number): SculptEdit[] {
  return [skin(tube(tailPath(), tailRadius), { blend: 0.1, color: C.flank }), ...spade(lod)];
}

/** Far LOD: the tail as a swept tube with three flat-ish blades. */
function tailLowpoly(): Mesh {
  // Thirteen rings: with nine the far tail's S along the ground read as a kinked stick.
  const path = resample(tailPath(), 13);
  const n = path.length - 1;
  return merge([
    skinTube(
      path.map((at, i) => ({ at, r: tailRadius(i / n) })),
      { sides: 6, color: C.flank },
    ),
    ...spadeSpecs(2).map((o) =>
      skinTube(
        hornNodes(o).map((nd) => ({ ...nd, r: Math.min(nd.r, 0.04) })),
        { sides: 3, color: C.horn },
      ),
    ),
  ]);
}

/** Tail mesh in the pivot's frame (pivot = TAIL_PIVOT). */
export function tailMesh(lod: 0 | 1 | 2): Mesh {
  const [px, py, pz] = TAIL_PIVOT;
  const toPivot = (m: Mesh): Mesh => place(m, { at: [-px, -py, -pz] });
  if (lod === 2) return merge([toPivot(tailLowpoly()), spineMesh(lod, 'tail')]);
  const form = tailEdits(lod);
  const scales = tailStamps(lod, sculptField(form, { color: C.flank }).field);
  const main = sculptPart({
    edits: [...form, ...scales.edits],
    res: [0.052, 0.125][lod] ?? 0.125,
    color: C.flank,
    tone: { reach: 0.1, ground: 0.5 },
    paint: tailPaint(lod, scales.shade),
    ...(lod === 0 ? { relief: tailRelief() } : {}),
  });
  return merge([toPivot(main.mesh), spineMesh(lod, 'tail')]);
}

/** Tail tip in world space (for checks and sockets). */
export const tailTip = (): Vec3 => pointAt(tailPath(), 1);
