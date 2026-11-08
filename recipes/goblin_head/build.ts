// Goblin bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the goblin spec,
// features (grin, teeth, worried brow, warts), wispy hair and outfit. Parts: `head`, `bust`
// (split under the scarf), `eye_l` / `eye_r`, `plinth`.

import type { BuildContext } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { outfitEdits } from './clothes.ts';
import { featureEdits } from './features.ts';
import { hairEdits } from './hair.ts';
import { C, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';

export const GOBLIN_BUST: BustRecipe = {
  spec: SPEC,
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  plinth: { radius: 0.1, color: C.plinth },
  cells: { head: [0.0036, 0.007, 0.016], bust: [0.0055, 0.01, 0.02] },
  features: (stage, skin, _lod, rng) => featureEdits(stage, skin, rng),
  hair: hairEdits,
  outfit: outfitEdits,
};

export function buildGoblin(ctx: BuildContext): void {
  buildBust(ctx, GOBLIN_BUST);
}
