// Goblin hair: pale wisps — a few thin tapered locks straggling up and back off a warty dome, each
// rooted in the scalp, toned grey at the root and near-white at the tip, no two alike (seeded).
// Card hair (`hairBaseEdits` + `goblinCardHair`): no sculpted wisps; sparse stray-strand cards
// rooted on the skull (`bustScalp`): a thin patch over the crown and two tufts behind the ears,
// standing up off the dome and curling back under their own weight, grey roots to white tips;
// sparse wiry brows (../_lib/face/brows.ts).

import type { Field, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { lock, mix } from '../_lib/bust/hair.ts';
import { type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
import { browLayers, withBrowComb } from '../_lib/face/brows.ts';
import { bustHairFields, type CardHairStyle, hugStyle } from '../_lib/face/hair-cards.ts';
import { C, H, L, SK } from './spec.ts';

export function hairEdits(scalp: Field, lod: number): SculptEdit[] {
  const s = surface(scalp);
  const out: SculptEdit[] = [];
  for (const [i, [dx, dy, len, lean]] of WISPS.entries()) {
    if (lod === 2 && i > 2) break;
    const ctrl = wispLine(s, dx, dy, len, lean);
    out.push(
      ...lock(spline(ctrl, 10), 0.0045, 0.0012, C.hairRoot, C.hairTip, { mirror: false, seg: 2 }),
    );
  }
  return out;
}

/** Wisps: x from the glabella (×H), y (×H), length (×H), lean. */
export const WISPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-0.3, 0.05, 0.42, 0.2],
  [-0.42, 0.14, 0.36, 0.5],
  [-0.55, 0.08, 0.4, 0.35],
  [-0.62, 0.2, 0.3, 0.7],
  [-0.5, -0.06, 0.34, -0.3],
  [-0.7, -0.12, 0.28, -0.6],
];

/** A wisp's control line: rooted in the scalp, up off the dome, then back. */
export function wispLine(s: Surface, dx: number, dy: number, len: number, lean: number): V[] {
  const root = wispRoot(s, dx, dy);
  const n = s.normal(root);
  return [
    root,
    [
      root[0] + n[0] * len * 0.3 * H,
      root[1] + n[1] * len * 0.3 * H + lean * 0.05 * H,
      root[2] + len * 0.35 * H,
    ],
    [root[0] - len * 0.35 * H, root[1] + lean * 0.18 * H, root[2] + len * 0.55 * H],
    [root[0] - len * 0.8 * H, root[1] + lean * 0.3 * H, root[2] + len * 0.45 * H],
  ];
}

/** Where a wisp is rooted: 6 mm into the scalp under (dx, dy). */
export function wispRoot(s: Surface, dx: number, dy: number): V {
  return s.off([L.gx + dx * H, dy * H, L.crown], -0.006);
}

/** No sculpted hair under the cards: the dome stays bare skin. */
export const hairBaseEdits = (_scalp: Field, _lod: number): SculptEdit[] => [];

/** Card wisps for `cardHair` on the goblin bust `b`: a sparse crown patch and two tufts behind
 *  the ears, thin stray strands standing up and curling back. LOD1 and LOD2 (D589): the same
 *  wisps a tenth shorter, lifted at most 0.55 rad and half pressed onto the dome (`hugStyle`)
 *  with four segments to curl round it: twice as wide and halved in segments, LOD0's 0.75 rad
 *  lift stood them off the skull as 6 cm quills. */
export function goblinCardHair(b: BustRecipe, lod: number): CardHairStyle {
  const style = nearHair(b, lod);
  if (lod === 0) return style;
  return hugStyle(style, {
    keep: ['wisps', 'tufts', 'brows'],
    lift: 0.55,
    hug: 0.5,
    length: 0.9,
    segments: 8,
  });
}

function nearHair(b: BustRecipe, lod: number): CardHairStyle {
  const { skin } = bustHairFields(b, lod);
  const crown: Vec3 = [SK.crown[0] - 0.02 * H, 0, SK.crown[2]];
  const patch: Field = (p) =>
    dmath.hypot((p[0] - crown[0]) * 0.8, p[1], Math.min(0, p[2] - crown[2] + 0.12 * H)) - 0.3 * H;
  // Behind each ear, a hand's width above the mastoid.
  const tuft: Field = (p) =>
    dmath.hypot(
      p[0] - (SK.earBack[0] - 0.035),
      Math.abs(p[1]) - Math.abs(SK.earBack[1]) * 0.8,
      p[2] - (SK.earTop[2] + 0.01),
    ) - 0.028;
  return {
    field: skin,
    bounds: [
      [L.back - 0.03, -0.12, SK.mastoid[2]],
      [L.gx + 0.03, 0.12, SK.crown[2] + 0.03],
    ] as [Vec3, Vec3],
    cell: 0.004,
    comb: withBrowComb((p: Vec3): Vec3 => [-1, Math.sign(p[1]) * 0.5, 0.35], SK, H),
    collide: skin,
    segments: 5,
    color: mix(C.hairRoot, C.hairTip, 0.4),
    // The lock style (D461): the wisps and tufts on its fine stray cells (on its coarse cells,
    // narrowed and doubled, they read as quills), sparse and wiry.
    locks: {},
    layers: [
      {
        name: 'wisps',
        kind: 'wisp',
        region: patch,
        density: 1500,
        length: 0.07,
        width: 0.009,
        lift: 0.75,
        bend: 0.7,
        droop: 0.45,
        roll: 1.2,
        clump: 3,
        fold: 0.3,
        hug: 0.15,
        tone: [0.7, 1.2],
        tint: [1.05, 1.05, 1.12],
      },
      {
        name: 'tufts',
        kind: 'wisp',
        region: tuft,
        density: 5000,
        length: 0.05,
        width: 0.009,
        lift: 0.5,
        bend: 0.6,
        droop: 0.5,
        roll: 1,
        clump: 3,
        fold: 0.3,
        hug: 0.15,
        tone: [0.7, 1.15],
        tint: [1.05, 1.05, 1.12],
      },
      // Sparse wiry old-man brows over the worried ridge.
      ...browLayers(SK, H, { thick: 0.004, length: 0.012, density: 200000, tone: [0.6, 1.1] }),
    ],
  };
}
