// Goblin bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the goblin spec,
// features (grin, teeth, worried brow, warts), wispy hair and outfit. Parts: `head`, `bust`
// (split under the scarf), `eye_l` / `eye_r`, `plinth`.

import { type BuildContext, hex } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { outfitEdits } from './clothes.ts';
import { featureEdits } from './features.ts';
import { goblinCardHair, hairBaseEdits } from './hair.ts';
import { C, CHARACTER, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';

export const GOBLIN_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // Gnarled: hard planes, bony brow and cheeks, deep lines, a stringy neck.
  forms: { planes: 1.2, brow: 1.3, cheek: 1.3, jaw: 0.8, neck: 1.2, lines: 1.6, lips: 0.6 },
  zones: { lips: C.lips, flush: hex('#a8a058'), socket: hex('#6f7a3c'), brows: hex('#4e5228') },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  plinth: { radius: 0.1, color: C.plinth },
  cells: { head: [0.004, 0.007, 0.016], bust: [0.0055, 0.01, 0.02] },
  features: (stage, skin, _lod, rng) => featureEdits(stage, skin, rng),
  hair: hairBaseEdits,
  outfit: outfitEdits,
};

export function buildGoblin(ctx: BuildContext): void {
  buildBust(ctx, GOBLIN_BUST);
  cardHair(ctx, goblinCardHair(GOBLIN_BUST, ctx.lod));
}
