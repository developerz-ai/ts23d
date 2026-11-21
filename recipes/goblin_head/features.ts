// Goblin face features beyond the shared head: a wide toothy grin (the cheeks bunched beside the
// mouth slit; its teeth are their own part, `goblinTeeth`: small, pointed, crooked and yellowed,
// two lower fangs rising in front of the upper lip), a worried brow (three forehead creases rising at the
// inner ends), warts seeded over nose, cheeks and dome, and flush on the nose and ears.

import { dmath, type Mesh, merge, type Rng, type SculptEdit } from '@developerz.ai/ts23d';
import { ball, cone2, creaseOn, norm, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import { mix, tooth } from '../_lib/face/teeth.ts';
import { ivoryTusk } from '../_lib/face/tusks.ts';
import { C, H, SK } from './spec.ts';

export function featureEdits(stage: number, s: Surface, _lod: number, _rng: Rng): SculptEdit[] {
  const out: SculptEdit[] = [];
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
  out.push(fangLips());
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

/** A lower fang's radius where it leaves the lip. */
const FANG_R = 0.014 * H;

/** A lower fang's centre line, root → tip: in the jaw below the slit a third of the way in from
 *  the corner, out at the slit (a third of the way along), curling up in front of the upper lip. */
export function fangPath(side: 1 | -1): V[] {
  const p = grinLine()[2] ?? SK.stomion;
  const at = (x: number, z: number): V => [p[0] + x * H, p[1] * side, p[2] + z * H];
  return spline([at(-0.034, -0.045), at(-0.017, 0), at(0.016, 0.022), at(0.024, 0.04)], 10);
}

/** The lower lip swollen round each fang's base: a lip-coloured sleeve along its buried stretch
 *  up to the slit, 1.35 × the fang's radius (the base never shows on the receding chin). */
function fangLips(): SculptEdit {
  const path = fangPath(1);
  const from = path[1] ?? SK.stomion;
  const gum = path[3] ?? SK.stomion;
  return cone2(from, gum, FANG_R * 1.2, FANG_R * 1.35, { blend: FANG_R * 0.6, color: C.lips });
}

/** Per tooth along the grin, corner → centre: [length ×, lean outward (share), width ×, stain]. */
const CROOKED: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.7, 0.1, 0.9, 0.3],
  [1.15, -0.25, 1.05, 0.1],
  [0.8, 0.3, 0.85, 0.35],
  [1.25, 0.05, 1.1, 0.05],
  [0.65, -0.2, 0.9, 0.25],
  [1.05, 0.15, 1, 0.15],
  [0.9, -0.1, 0.95, 0.2],
];

/** The goblin's teeth as a part (sculpted cones finer than the head cell were lost in it). Over
 *  the closed grin: small pointed upper teeth rooted in the upper lip, their tips hanging out over
 *  the lower lip, each a different length, lean and stain (none paper-white); and two lower
 *  fangs a third of the way in from the corners, rooted in the jaw, leaving the lower lip at the
 *  slit and curling up in front of the upper lip: the goblin's underbite. LOD1 keeps the fangs and every other tooth. */
export function goblinTeeth(lod: number): Mesh {
  const line = grinLine();
  const seg = lod === 0 ? 7 : 3;
  const out: Mesh[] = [];
  for (const side of [1, -1] as const)
    for (let i = 0; i < line.length - 1; i++) {
      if (lod > 0 && i % 2 === 1) continue;
      const p = line[i] ?? SK.stomion;
      const j = CROOKED[(i + (side < 0 ? 3 : 0)) % CROOKED.length] ?? [1, 0, 1, 0];
      const k = i === 0 ? 0.6 : 1;
      out.push(
        tooth(
          [p[0] - 0.022 * H, p[1] * side, p[2] + 0.012 * H],
          norm([0.45, j[1] * side * 0.4, -1]),
          0.04 * H * k * j[0],
          0.013 * H * k * j[2],
          mix(C.teeth, C.teethStain, j[3]),
          seg,
          true,
        ),
      );
    }
  // The fangs: small curved tusks (../_lib/face/tusks.ts `ivoryTusk`), narrow in the jaw,
  // thickest where they leave the lip at the slit, curling up in front of the upper lip.
  for (const side of [1, -1] as const) {
    const path = fangPath(side);
    out.push(
      ivoryTusk(path, {
        radius: FANG_R,
        gum: 1 / 3,
        seg,
        ivory: C.teeth,
        tip: C.teeth,
        stain: C.teethStain,
      }),
    );
  }
  return merge(out);
}
