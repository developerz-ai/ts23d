// Goblin face features beyond the shared head: a wide toothy grin (small pointed teeth along the
// mouth slit, the cheeks bunched beside it), a worried brow (three forehead creases rising at the
// inner ends), warts seeded over nose, cheeks and dome, and flush on the nose and ears.

import type { Rng, SculptEdit } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { ball, cone2, creaseOn, type Surface, type V } from '../_lib/bust/kit.ts';
import { C, H, SK } from './spec.ts';

export function featureEdits(stage: number, s: Surface, _lod: number, _rng: Rng): SculptEdit[] {
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
  // (The row runs the whole grin, corner to corner: seven a side, the pair by the corner small.)
  for (let i = 0; i < line.length - 1; i++) {
    const p = line[i] ?? SK.stomion;
    const k = i === 0 ? 0.6 : 1;
    for (const [dz, tip] of [
      [0.009 * H, -0.022 * H * k],
      [-0.009 * H, 0.019 * H * k],
    ] as const)
      out.push(
        cone2(
          [p[0] - 0.004 * H, p[1], p[2] + dz],
          [p[0] + 0.003 * H, p[1], p[2] + dz + tip],
          0.0085 * H * k,
          0.0015 * H,
          {
            blend: 0.002 * H,
            color: C.teeth,
          },
        ),
      );
  }
  if (stage < 4) return out;
  // The ear's drawn-out tip: its cartilage edge thickened over the last 3 cm (the blade thins to
  // a film there, and the rim reads as an edge, not a paper cut-out).
  const tip: V = [SK.earTip[0], Math.abs(SK.earTip[1]), SK.earTip[2]];
  const top: V = [SK.earTop[0], Math.abs(SK.earTop[1]), SK.earTop[2]];
  const d = dmath.hypot(tip[0] - top[0], tip[1] - top[1], tip[2] - top[2]) || 1;
  const at = (back: number): V => [
    tip[0] - ((tip[0] - top[0]) / d) * back,
    tip[1] - ((tip[1] - top[1]) / d) * back,
    tip[2] - ((tip[2] - top[2]) / d) * back,
  ];
  out.push(cone2(at(0.022), at(0.004), 0.002, 0.0011, { blend: 0.003 }));
  // Worried brow: three creases, inner ends raised.
  for (const l of browLines()) out.push(creaseOn(s, l, 0.008 * H, 0.004 * H));
  // Warts, seeded: on the nose, the cheeks and the dome (not mirrored).
  for (const [p, r] of WARTS)
    out.push(ball(s.off(p, 0), r * H, { blend: r * H * 0.6, color: C.wart, mirror: false }));
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

/** Wart spots (not mirrored) and their radius × H: no two the same size. */
export const WARTS: ReadonlyArray<[V, number]> = [
  [[SK.pronasale[0] - 0.05 * H, 0.03 * H, SK.pronasale[2] + 0.05 * H], 0.014],
  [[SK.cheek[0] - 0.02 * H, -SK.cheek[1] - 0.02 * H, SK.cheek[2]], 0.023],
  [[SK.crown[0] + 0.06 * H, 0.18 * H, SK.crown[2] - 0.05 * H], 0.019],
  [[SK.cheek[0] - 0.03 * H, SK.cheek[1] + 0.03 * H, SK.cheek[2] - 0.05 * H], 0.012],
  [[SK.crown[0] - 0.1 * H, -0.12 * H, SK.crown[2] - 0.06 * H], 0.021],
  [[SK.glabella[0] - 0.03 * H, -0.16 * H, SK.glabella[2] + 0.12 * H], 0.011],
];

/** The far LOD's ears: one tapered blade a side from the ear's root to its tip, never thinner
 *  than the coarse cell (the anatomical ear is a 3 mm sheet the far cell cannot hold). */
export function farEars(cell: number): SculptEdit[] {
  const root: V = [SK.tragion[0] - 0.012, Math.abs(SK.tragion[1]) - 0.004, SK.tragion[2] + 0.004];
  const tip: V = [SK.earTip[0], Math.abs(SK.earTip[1]), SK.earTip[2]];
  return [cone2(root, tip, cell * 0.85, cell * 0.5, { blend: cell * 0.4, color: C.skin })];
}

/** The mouth slit, corner to centre (left half). */
export function grinLine(): V[] {
  const a = SK.cheilion;
  const b = SK.stomion;
  return [0.06, 0.2, 0.34, 0.48, 0.62, 0.76, 0.9, 1].map(
    (t): V => [
      a[0] + (b[0] - a[0]) * t + dmath.sin(t * Math.PI) * 0.004 * H,
      a[1] * (1 - t),
      a[2] + (b[2] - a[2]) * t,
    ],
  );
}
