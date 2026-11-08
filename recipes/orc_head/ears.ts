// Orc ears: pointed, swept back and out from just behind the jaw hinge. Built in the ear's own
// frame (u root → tip, v across the blade, w out of its front face): a flattened blade with a long
// pointed tip, a rolled helix rim, the concha bowl and tragus, an earlobe — all × EAR_SCALE (the
// ears declared 1.2 × the first sculpt). The right ear's torn notch is a defect (defects.ts).
// Stage 1 = blade, 3 = structure.

import type { SculptEdit } from '@developerz.ai/ts23d';
import {
  at,
  ball,
  crease,
  type Frame,
  frameOf,
  k,
  local,
  spline,
  type V,
} from '../_lib/bust/kit.ts';
import { L } from './landmarks.ts';

/** Ear size × the first sculpt (declared, README): the ears read bigger against the ×1.35 jaw. */
export const EAR_SCALE = 1.2;

/** The left ear's frame (the sculpt mirrors it): root at the ear canal, pointing back-out-up. */
export const EAR: Frame = frameOf(
  [L.ear[0] + 0.004, L.ear[1] - 0.004, L.ear[2] + 0.002],
  [-0.6, 0.78, 0.3],
  [0.55, 0.8, 0.05],
);

/** A point in the ear's frame, in the unscaled ear's coordinates (× EAR_SCALE). */
export const atEar = (u: number, v: number, w: number): V =>
  at(EAR, u * EAR_SCALE, v * EAR_SCALE, w * EAR_SCALE);

type Shape = (u: number, v: number, w: number) => number;
/** A local shape grown by EAR_SCALE (exact for distance fields). */
const grow =
  (f: Shape): Shape =>
  (u, v, w) =>
    f(u / EAR_SCALE, v / EAR_SCALE, w / EAR_SCALE) * EAR_SCALE;
const box = (b: readonly [V, V]): [V, V] => [
  [b[0][0] * EAR_SCALE, b[0][1] * EAR_SCALE, b[0][2] * EAR_SCALE],
  [b[1][0] * EAR_SCALE, b[1][1] * EAR_SCALE, b[1][2] * EAR_SCALE],
];

export function earEdits(stage: number): SculptEdit[] {
  const out: SculptEdit[] = [];
  const blade: SculptEdit[] = [
    // Blade: broad near the root, a flattened leaf.
    local(
      EAR,
      grow(k.ellipsoid(0.034, 0.002, 0, 0.042, 0.026, 0.015)),
      box([
        [-0.01, -0.03, -0.012],
        [0.08, 0.03, 0.012],
      ]),
    ),
    // Long pointed tip, flattened.
    local(
      EAR,
      grow(k.roundCone([0.05, 0.006, 0], [0.096, 0.016, -0.004], 0.014, 0.0042)),
      box([
        [0.03, -0.02, -0.02],
        [0.11, 0.04, 0.02],
      ]),
      { squash: 1.45, blend: 0.014 },
    ),
    // Lobe: a heavy rounded drop at the lower root.
    local(
      EAR,
      grow(k.ellipsoid(0.008, -0.022, 0, 0.012, 0.011, 0.008)),
      box([
        [-0.01, -0.04, -0.01],
        [0.03, -0.005, 0.01],
      ]),
    ),
  ];
  if (stage >= 3) {
    // Helix rim: rolled along the back/top edge of the blade to the tip.
    const rim: V[] = spline(
      [
        [0.002, 0.024, 0.004],
        [0.03, 0.03, 0.006],
        [0.062, 0.025, 0.004],
        [0.092, 0.016, 0.0],
      ],
      8,
    ).map(([u, v, w]) => atEar(u, v, w));
    blade.push(crease(rim, 0.006 * EAR_SCALE, { op: 'add', blend: 0.005, tips: 0.4 }));
    // Concha: the bowl in the front face, and the scapha groove inside the rim.
    blade.push(
      local(
        EAR,
        grow(k.ellipsoid(0.024, -0.002, 0.011, 0.024, 0.014, 0.008)),
        box([
          [-0.01, -0.03, -0.01],
          [0.06, 0.03, 0.03],
        ]),
        { op: 'subtract', blend: 0.004 },
      ),
    );
    blade.push(
      crease(
        spline(
          [
            [0.012, 0.016, 0.009],
            [0.04, 0.02, 0.009],
            [0.07, 0.014, 0.006],
          ],
          7,
        ).map(([u, v, w]) => atEar(u, v, w)),
        0.003 * EAR_SCALE,
        { blend: 0.003 },
      ),
    );
  }
  out.push({ group: blade, blend: 0.012 });
  if (stage >= 3) {
    // Tragus: the little flap over the canal, in front of the concha.
    out.push(ball(atEar(-0.002, -0.006, 0.01), 0.0065 * EAR_SCALE, { blend: 0.005 }));
  }
  return out;
}

/** Iron rings through the ear rim (left; the bust mirrors the part): [centre, axis] pairs. */
export function earRings(): Array<{ c: V; axis: V }> {
  return [
    { c: atEar(0.052, 0.033, 0), axis: EAR.w },
    { c: atEar(0.03, 0.035, 0), axis: EAR.w },
  ];
}
