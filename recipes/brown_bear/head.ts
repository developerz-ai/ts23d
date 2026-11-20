// The brown bear's own head forms over the creature kind's block-out (head-local: +X to the nose,
// origin at the atlas, left = +Y; the sculpt mirrors them). The kind's ursid head is a wedge:
// skull and muzzle run into one cone. A bear's is not: the frontal bone stands up steeply behind
// the bridge of the nose (the "dished" profile), the crown is broad and round with the jaw
// muscles, and the ears are thick furred discs on the skull's upper corners (README: skull).

import type { CreatureInfo, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { facePlanes } from '../_lib/creature/wild-head.ts';

type Head = CreatureInfo['head'];

/** Ear centre (left), radius and thickness, head-local, as ratios of the head. */
export function earDisc(l: Pick<Head, 'L' | 'W' | 'H' | 'lc'>): {
  at: Vec3;
  r: number;
  thick: number;
} {
  return { at: [0.24 * l.lc, 0.37 * l.W, 0.47 * l.H], r: 0.135 * l.L, thick: 0.05 * l.L };
}

export function bearHead(l: Head): SculptEdit[] {
  const { L, W, H, lc } = l;
  const ear = earDisc(l);
  // The disc faces forward and a little out; its hollow is on that face.
  const face: Vec3 = [dmath.cos(0.45), dmath.sin(0.45), 0];
  const front = (k: number): Vec3 => [
    ear.at[0] + face[0] * ear.thick * k,
    ear.at[1] + face[1] * ear.thick * k,
    ear.at[2] + ear.r * 0.08,
  ];
  return [
    // The dark lid rim: a bear's eye is small and deep-set, the rim is what reads (the shared
    // brow and cheek forms fold into creases against this head's dome at its 11 mm cells).
    ...facePlanes(l, { forms: false, rim: [0.02, 0.014, 0.01], rimSize: 1.7 }),
    // Frontal dome: between and above the eyes, ending steeply at the stop.
    {
      shape: 'ellipsoid',
      at: [0.84 * lc, 0, 0.33 * H],
      size: [0.27 * lc, 0.22 * W, 0.29 * H],
      blend: 0.045 * L,
    },
    // Crown: temporal muscles rounding the top of the skull out toward the ears.
    {
      shape: 'ellipsoid',
      at: [0.36 * lc, 0.17 * W, 0.34 * H],
      size: [0.4 * lc, 0.27 * W, 0.25 * H],
      blend: 0.08 * L,
    },
    // Ear: a thick round disc, its root buried in the crown fur.
    {
      shape: 'ellipsoid',
      at: ear.at,
      size: [ear.thick, ear.r, ear.r],
      rotate: [0, -12, 26],
      blend: 0.05 * L,
    },
    // The hollow of the ear, shallow, and the dark fur inside it.
    {
      shape: 'ellipsoid',
      at: front(0.95),
      size: [ear.thick * 0.6, ear.r * 0.62, ear.r * 0.62],
      rotate: [0, -12, 26],
      op: 'subtract',
      blend: 0.02 * L,
    },
    {
      shape: 'ellipsoid',
      at: front(0.6),
      size: [ear.thick * 0.7, ear.r * 0.66, ear.r * 0.66],
      rotate: [0, -12, 26],
      op: 'paint',
      blend: 0.015 * L,
      color: [0.045, 0.028, 0.018],
    },
  ];
}
