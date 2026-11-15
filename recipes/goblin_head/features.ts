// Goblin face features beyond the shared head: a wide toothy grin (small pointed teeth along the
// mouth slit, the cheeks bunched beside it), a worried brow (three forehead creases rising at the
// inner ends), warts seeded over nose, cheeks and dome, and flush on the nose and ears.

import type { Rng, SculptEdit } from '@developerz.ai/ts23d';
import { ball, cone2, creaseOn, type Surface, type V } from '../_lib/bust/kit.ts';
import { C, H, SK } from './spec.ts';

export function featureEdits(stage: number, s: Surface, rng: Rng): SculptEdit[] {
  const out: SculptEdit[] = [];
  const line = grinLine();
  // Grin: cheeks bunched up at the mouth corners.
  out.push(
    ball(
      [SK.cheilion[0] - 0.02 * H, SK.cheilion[1] + 0.012 * H, SK.cheilion[2] + 0.03 * H],
      0.03 * H,
      {
        blend: 0.06 * H,
      },
    ),
  );
  // Pointed teeth along the slit, upper row pointing down, lower up, their roots behind the lips.
  for (let i = 1; i < 5; i++) {
    const p = line[line.length - 1 - i] ?? SK.stomion;
    for (const [dz, tip] of [
      [0.008 * H, -0.018 * H],
      [-0.008 * H, 0.016 * H],
    ] as const)
      out.push(
        cone2(
          [p[0] - 0.004 * H, p[1], p[2] + dz],
          [p[0] + 0.002 * H, p[1], p[2] + dz + tip],
          0.008 * H,
          0.0015 * H,
          {
            blend: 0.002 * H,
            color: C.teeth,
          },
        ),
      );
  }
  if (stage < 4) return out;
  // Worried brow: three creases, inner ends raised.
  for (const l of browLines()) out.push(creaseOn(s, l, 0.008 * H, 0.004 * H));
  // Warts, seeded: on the nose, the cheeks and the dome (not mirrored).
  for (const [p, r] of WARTS) {
    const j = 0.7 + rng.next() * 0.6;
    out.push(ball(s.off(p, 0), r * H * j, { blend: r * H * 0.6, color: C.wart, mirror: false }));
  }
  return out;
}

/** The three worried-brow creases (left half, mirrored), inner ends raised. */
export function browLines(): V[][] {
  const g = SK.glabella;
  return [0, 1, 2].map((i) => {
    const z = g[2] + (0.07 + i * 0.05) * H;
    return [
      [g[0] - 0.05 * H, 0.2 * H, z - 0.02 * H],
      [g[0] - 0.012 * H, 0.08 * H, z + 0.015 * H],
      [g[0] - 0.008 * H, 0, z + 0.01 * H - i * 0.002 * H],
    ];
  });
}

/** Wart spots (not mirrored) and their radius × H before the seeded jitter (×0.7 … ×1.3). */
export const WARTS: ReadonlyArray<[V, number]> = [
  [[SK.pronasale[0] - 0.05 * H, 0.03 * H, SK.pronasale[2] + 0.05 * H], 0.016],
  [[SK.cheek[0] - 0.02 * H, -SK.cheek[1] - 0.02 * H, SK.cheek[2]], 0.02],
  [[SK.crown[0] + 0.06 * H, 0.18 * H, SK.crown[2] - 0.05 * H], 0.022],
  [[SK.cheek[0] - 0.03 * H, SK.cheek[1] + 0.03 * H, SK.cheek[2] - 0.05 * H], 0.014],
  [[SK.crown[0] - 0.1 * H, -0.12 * H, SK.crown[2] - 0.06 * H], 0.018],
];

/** The mouth slit, corner to centre (left half). */
export function grinLine(): V[] {
  const a = SK.cheilion;
  const b = SK.stomion;
  return [0, 0.25, 0.5, 0.75, 1].map(
    (t): V => [
      a[0] + (b[0] - a[0]) * t + Math.sin(t * Math.PI) * 0.004 * H,
      a[1] * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ],
  );
}
