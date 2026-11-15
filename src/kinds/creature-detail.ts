// Detail regions (sdf boxes meshed at half the cell) where a creature is looked at closely: the
// paws of the body sculpt (toes, pads, claws' beds) and, in the head sculpt, the eyes (lids) and
// the nose leather. Boxes are given for both sides (the grid is mirrored, the boxes are not) and
// kept apart by more than a cell, as sdf-detail.ts requires.

import type { Vec3 } from '../core/index.ts';
import type { DetailRegion } from '../primitives/index.ts';
import type { Bones } from './creature-bones.ts';
import type { HeadLayout } from './creature-head.ts';

const both = (lo: Vec3, hi: Vec3): DetailRegion[] => [
  { bounds: [lo, hi], factor: 2 },
  {
    bounds: [
      [lo[0], -hi[1], lo[2]],
      [hi[0], -lo[1], hi[2]],
    ],
    factor: 2,
  },
];

/** Paw boxes (body sculpt, LOD0): each toed foot from a cell above the ground (the flat sole stays on
 *  the coarse lattice, which lies exactly on z = 0) to above its toes. */
export function detailBoxes(b: Bones, res: number): DetailRegion[] {
  // Hooves are a few smooth cones: only toed feet (paws, soles, bird feet) get the finer cells.
  return b.legs
    .filter((l) => l.hoof === null)
    .flatMap((l) => {
      const [sx, sy, sz] = l.footSize;
      const f = l.foot;
      const lo: Vec3 = [f[0] - sx * 1.3, Math.max(res * 2, f[1] - sy * 1.4), res];
      return both(lo, [f[0] + sx * 1.4, f[1] + sy * 1.4, sz * 2.2]);
    });
}

/** Eye and nose boxes (head sculpt, head-local, LOD0). */
export function headDetail(l: HeadLayout, res: number): DetailRegion[] {
  const e = l.eye.centre;
  const r = l.eye.r * 2.4;
  const n = l.nose;
  const nr = l.rt * 1.1;
  return [
    ...both([e[0] - r, Math.max(res * 2, e[1] - r), e[2] - r], [e[0] + r, e[1] + r, e[2] + r]),
    {
      bounds: [
        [n[0] - nr * 1.2, -nr, n[2] - nr],
        [n[0] + nr, nr, n[2] + nr],
      ],
      factor: 2,
    },
  ];
}
