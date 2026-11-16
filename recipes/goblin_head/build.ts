// Goblin bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the goblin spec,
// features (grin, teeth, worried brow, warts), wispy hair and outfit. Parts: `head`, `bust`
// (split under the scarf), `eye_l` / `eye_r`, `plinth`.

import { type BuildContext, hex } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { neckSeam } from '../_lib/bust/torso.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { outfitEdits } from './clothes.ts';
import { featureEdits } from './features.ts';
import { goblinCardHair, hairBaseEdits } from './hair.ts';
import { C, CHARACTER, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';

const SEAM = neckSeam(L).field;

export const GOBLIN_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // Gnarled: hard planes, bony brow and cheeks, deep lines, a stringy neck.
  forms: { planes: 1.2, brow: 1.3, cheek: 1.3, jaw: 0.8, neck: 1.2, lines: 1.6, lips: 0.6 },
  zones: {
    lips: C.lips,
    flush: hex('#a88a52'),
    socket: hex('#76803f'),
    brows: hex('#747650'),
    forehead: hex('#94a050'),
    lashes: hex('#3a3a20'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // A wider curvature stencil (the skull's mesh field rings in 4 mm); a warty hide's speckle.
  paint: { stencil: 0.006, speckle: 0.2 },
  plinth: { radius: 0.1, color: C.plinth },
  cells: { head: [0.004, 0.007, 0.016], bust: [0.0055, 0.01, 0.02] },
  // The parts split at the neck seam, bent up over the shoulders: the shoulder cloth above the
  // tilted seam (D61) belongs to `bust`, so `head` stays a neck-wide piece seated on it.
  split: (p) => SEAM(p) - 2 * Math.max(0, Math.abs(p[1]) - 0.055),
  features: (stage, skin, _lod, rng) => featureEdits(stage, skin, rng),
  hair: hairBaseEdits,
  outfit: outfitEdits,
};

export function buildGoblin(ctx: BuildContext): void {
  buildBust(ctx, GOBLIN_BUST);
  cardHair(ctx, goblinCardHair(GOBLIN_BUST, ctx.lod));
}
