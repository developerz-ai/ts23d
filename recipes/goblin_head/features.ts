// Goblin face features beyond the shared head: a wide toothy grin (the cheeks bunched beside the
// mouth slit; its teeth are their own part, `goblinTeeth`: small, pointed, crooked and yellowed,
// two lower fangs rising in front of the upper lip), a worried brow (three forehead creases rising at the
// inner ends), warts seeded over nose, cheeks and dome, and flush on the nose and ears.

import { dmath, type Mesh, merge, type Rng, type SculptEdit } from '@developerz.ai/ts23d';
import { earGraft } from '../_lib/bust/ear-graft.ts';
import { structureEdits } from '../_lib/bust/face-forms.ts';
import {
  ball,
  chain,
  cone2,
  creaseOn,
  ell,
  norm,
  type Surface,
  spline,
  taper,
  type V,
} from '../_lib/bust/kit.ts';
import { mix, tooth } from '../_lib/face/teeth.ts';
import { ivoryTusk } from '../_lib/face/tusks.ts';
import { C, EYE, GRAFT, H, SK, STRUCTURE } from './spec.ts';

export function featureEdits(stage: number, s: Surface, lod: number, _rng: Rng): SculptEdit[] {
  // The bones and the lids over the soft base (D570–D572).
  const out: SculptEdit[] = structureEdits(SK, EYE, H, s, STRUCTURE, lod);
  // The ears as leaf blades of real thickness (D574); LOD1's 1 cm cell holds a plain one no
  // thinner than itself, unnotched.
  out.push(
    ...earGraft(SK, lod === 0 ? GRAFT : { ...GRAFT, thick: 0.011, simple: true, notches: [] }),
  );
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
  // (The lips' rolls and the mouth's gap are finer than LOD1's cell.)
  out.push(...(lod === 0 ? lipEdits() : []), fangLips());
  if (stage < 4) return out;
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

/** The lips as rolls of flesh along the slit (on the base they are a cut in a flat muzzle: a
 *  slot, D576): an upper lip standing over the teeth's roots, a lower lip set back under their
 *  tips (the receding jaw), both tapering into the corners, lip-coloured; the dark gap of the
 *  mouth between them; and the mentolabial hollow under the lower lip that turns the chin into a
 *  form of its own. */
export function lipEdits(): SculptEdit[] {
  const line = grinLine();
  const n = line.length;
  const roll = (dx: number, dz: number): V[] =>
    line.map((p, i): V => {
      const t = i / (n - 1);
      return [p[0] + dx * H * (0.4 + 0.6 * t), p[1], p[2] + dz * H * (0.6 + 0.4 * t)];
    });
  const brush = { blend: 0.008 * H, color: C.lips } as const;
  return [
    chain(roll(0.002, 0.028), taper(n, 0.005 * H, 0.011 * H), brush),
    chain(roll(-0.008, -0.036), taper(n, 0.005 * H, 0.012 * H), brush),
    // The mouth itself: a dark gap between the lips, behind the teeth (they stand in a jaw,
    // not on a lip).
    chain(roll(-0.012, -0.006), taper(n, 0.003 * H, 0.011 * H), {
      op: 'subtract',
      blend: 0.004 * H,
      color: C.mouth,
    }),
    ...roll(-0.012, -0.006).map((p, i) =>
      ball(p, (0.004 + 0.007 * (i / (n - 1))) * H, {
        op: 'paint',
        blend: 0.003 * H,
        color: C.mouth,
      }),
    ),
    ell(
      [SK.stomion[0] - 0.024 * H, 0, SK.stomion[2] - 0.052 * H],
      [0.02 * H, Math.abs(SK.cheilion[1]) * 0.55, 0.014 * H],
      { op: 'subtract', blend: 0.014 * H, mirror: false },
    ),
  ];
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
