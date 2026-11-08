// Goblin outfit, sculpted on: a linen shirt (paint below the neck seam) with creases, an open
// leather vest over it (the torso pushed out 7 mm outside a front opening), a hood worn down as a
// thick roll on the back of the neck and traps, and a knotted red scarf round the neck seam with
// its tails hanging at the front.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { chain, creaseOn, onCurve, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import { baseZ, garment, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, L, TORSO } from './spec.ts';

export function outfitEdits(body: Field, skin: Surface, lod: number): SculptEdit[] {
  const seam = neckSeam(L);
  const box: [V, V] = [
    [-0.3, -0.3, 0],
    [0.3, 0.3, L.mz + 0.02],
  ];
  const plan = (p: V): number => Math.hypot(p[0] - seam.at[0], p[1]);
  const out: SculptEdit[] = [];
  out.push({
    field: (p) =>
      Math.max(Math.min(seam.field(p) + 0.003, 0.04 - plan(p)), p[2] - (L.mz - 0.1 * H)),
    bounds: box,
    op: 'paint',
    blend: 0.002,
    color: C.shirt,
  });
  // Vest: below the shoulder tops, outside a front V opening that widens downward.
  out.push({
    field: garment(body, 0.007, vestRegion, baseZ(TORSO)),
    bounds: box,
    color: C.vest,
    // A hemmed edge, not a knife-cut step.
    blend: 0.012,
  });
  // Hood down: a thick roll behind the neck.
  out.push({
    field: garment(body, 0.022, hoodRegion, baseZ(TORSO)),
    bounds: box,
    color: C.hood,
    // A soft roll: the hood folded down meets the vest and neck in a wide fillet.
    blend: 0.016,
  });
  // Scarf: a thick knotted band round the seam, the knot at the front left, tails hanging.
  const ring = scarfRing(skin.field);
  out.push(chain([...ring, ring[0] ?? seam.at], 0.011, { color: C.scarf, mirror: false }));
  const knot = scarfKnot(skin);
  out.push({
    shape: 'ellipsoid',
    at: knot,
    size: [0.014, 0.018, 0.015],
    color: C.scarf,
    mirror: false,
  });
  if (lod < 2) {
    for (const tail of scarfTails(skin))
      out.push(
        chain(tail, [0.01, 0.009, 0.008, 0.008, 0.007, 0.007, 0.006, 0.005], {
          color: C.scarf,
          mirror: false,
        }),
      );
    // Shirt creases at the opening.
    out.push(
      creaseOn(
        skin,
        [
          [L.gx - 0.22 * H, 0.012, seam.at[2] - 0.03],
          [L.gx - 0.2 * H, 0.018, seam.at[2] - 0.08],
        ],
        0.003,
        0.002,
        { color: C.shirtDark },
      ),
    );
  }
  return out;
}

/** Vest: below the shoulder tops, outside a front V opening that widens downward (≤ 0 inside). */
export const vestRegion: Field = (p) => {
  const seam = neckSeam(L);
  const top = p[2] - (seam.at[2] - 0.006);
  const opening = 0.02 + (seam.at[2] - p[2]) * 0.2 - Math.abs(p[1]);
  const front = p[0] - (L.gx - 0.3 * H);
  // Inside the opening = (|y| < w) and on the front: removed.
  return Math.max(top, -Math.max(-opening, -front));
};

/** The hood worn down: a band behind the neck either side of the seam (≤ 0 inside). */
export const hoodRegion: Field = (p) => {
  const seam = neckSeam(L);
  return Math.max(p[0] - (seam.at[0] - 0.02), seam.field(p) - 0.03, -seam.field(p) - 0.015);
};

/** The scarf band's centre line: the skin round the neck seam. */
export function scarfRing(skin: Field): V[] {
  const seam = neckSeam(L);
  return onCurve(
    skin,
    seam.field,
    Array.from({ length: 24 }, (_, i): V => {
      const a = (i / 24) * Math.PI * 2;
      return [
        seam.at[0] + 0.05 * Math.cos(a),
        0.05 * Math.sin(a),
        seam.at[2] - 0.3 * 0.05 * Math.cos(a),
      ];
    }),
  );
}

/** The scarf knot at the front left. */
export function scarfKnot(skin: Surface): V {
  return skin.off([L.gx - 0.2 * H, 0.025, neckSeam(L).at[2] - 0.01], 0.016);
}

/** The two scarf tails hanging from the knot. */
export function scarfTails(skin: Surface): V[][] {
  const knot = scarfKnot(skin);
  return (
    [
      [0.01, 0.07],
      [0.032, 0.055],
    ] as const
  ).map(([dy, len]) =>
    spline(
      [
        knot,
        skin.off([knot[0] - 0.01, knot[1] + dy, knot[2] - len * 0.5], 0.01),
        skin.off([knot[0] - 0.012, knot[1] + dy * 1.4, knot[2] - len], 0.008),
      ],
      8,
    ),
  );
}

/** Shirt crease lines at the vest opening. */
export function shirtCreases(): V[][] {
  const seam = neckSeam(L);
  return [
    [
      [L.gx - 0.22 * H, 0.012, seam.at[2] - 0.03],
      [L.gx - 0.2 * H, 0.018, seam.at[2] - 0.08],
    ],
  ];
}
