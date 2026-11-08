// Goblin face features beyond the shared head: a wide toothy grin (small pointed teeth along the
// mouth slit, the cheeks bunched beside it), a worried brow (three forehead creases rising at the
// inner ends), warts seeded over nose, cheeks and dome, and flush on the nose and ears.

import type { Rng, SculptEdit } from '@developerz.ai/ts23d';
import { ball, cone2, creaseOn, type Surface, type V } from '../_lib/bust/kit.ts';
import { C, H, L } from './spec.ts';

export function featureEdits(stage: number, s: Surface, rng: Rng): SculptEdit[] {
  const out: SculptEdit[] = [];
  const mz = L.mouth[2];
  const arc = (r: number, a: number, z: number): V => {
    const t = (a * Math.PI) / 180;
    return [L.teeth.x + r * Math.cos(t), r * Math.sin(t), z];
  };
  // Grin: cheeks bunched up at the mouth corners.
  out.push(ball(arc(L.teeth.r - 0.02 * H, 48, mz + 0.03 * H), 0.032 * H, { blend: 0.08 * H }));
  // Pointed teeth along the slit, upper row pointing down, lower up.
  for (let i = 0; i < 4; i++) {
    const a = 6 + i * 11;
    for (const [z0, dz] of [
      [mz + 0.012 * H, -0.03 * H],
      [mz - 0.012 * H, 0.028 * H],
    ] as const)
      out.push(
        cone2(
          arc(L.teeth.r + 0.004 * H, a, z0),
          arc(L.teeth.r + 0.008 * H, a, z0 + dz),
          0.011 * H,
          0.002 * H,
          {
            blend: 0.002 * H,
            color: C.teeth,
          },
        ),
      );
  }
  if (stage < 4) return out;
  // Worried brow: three creases, inner ends raised.
  for (const line of browLines()) out.push(creaseOn(s, line, 0.008 * H, 0.005 * H));
  // Warts, seeded: on the nose, the cheeks and the dome (not mirrored).
  for (const [p, r] of WARTS) {
    const j = 0.7 + rng.next() * 0.6;
    out.push(ball(s.off(p, 0), r * H * j, { blend: r * H * 0.6, color: C.wart, mirror: false }));
  }
  return out;
}

/** The three worried-brow creases (left half, mirrored), inner ends raised. */
export function browLines(): V[][] {
  return (
    [
      [0, 0.72],
      [1, 0.78],
      [2, 0.84],
    ] as const
  ).map(([i, dz]) => {
    const z = L.mz + dz * H;
    return [
      [L.gx - 0.02 * H, 0.2 * H, z - 0.02 * H],
      [L.gx + 0.01 * H, 0.08 * H, z + 0.015 * H],
      [L.gx + 0.015 * H, 0, z + 0.01 * H - i * 0.002 * H],
    ];
  });
}

/** Wart spots (not mirrored) and their radius × H before the seeded jitter (×0.7 … ×1.3). */
export const WARTS: ReadonlyArray<[V, number]> = [
  [[L.noseTip[0] - 0.05 * H, 0.03 * H, L.noseTip[2] + 0.05 * H], 0.016],
  [[L.gx - 0.15 * H, -0.24 * H, L.eye[2] - 0.12 * H], 0.02],
  [[L.gx - 0.3 * H, 0.18 * H, L.crown - 0.03 * H], 0.022],
  [[L.gx - 0.12 * H, 0.22 * H, L.eye[2] - 0.18 * H], 0.014],
  [[L.gx - 0.45 * H, -0.12 * H, L.crown - 0.05 * H], 0.018],
];

/** The mouth slit's arc on the teeth cylinder, corner to centre (left half). */
export function grinLine(): V[] {
  return [48, 36, 24, 12, 0].map((a) => {
    const t = (a * Math.PI) / 180;
    return [L.teeth.x + L.teeth.r * Math.cos(t), L.teeth.r * Math.sin(t), L.mouth[2]];
  });
}
