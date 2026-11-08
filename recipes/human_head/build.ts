// Human bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the human spec, hair,
// beard and outfit. Parts: `head`, `bust` (split under the collar), `brooch`, `eye_l` / `eye_r`,
// `plinth`.

import { type BuildContext, sculpt } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { brooch, outfitEdits } from '../_lib/bust/human/clothes.ts';
import { C, EAR, EYE, L, SPEC, TORSO } from '../_lib/bust/human/spec.ts';
import { hairEdits } from './hair.ts';

export const HUMAN_BUST: BustRecipe = {
  spec: SPEC,
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  plinth: { radius: 0.13, color: C.plinth },
  cells: { head: [0.0045, 0.008, 0.02], bust: [0.0065, 0.011, 0.024] },
  hair: hairEdits,
  outfit: outfitEdits,
  extras: (_ctx, skin) => ({
    brooch: sculpt({ edits: brooch(skin), resolution: 0.0016, color: C.brass, strip: 'brass' }),
  }),
};

export function buildHuman(ctx: BuildContext): void {
  buildBust(ctx, HUMAN_BUST);
}
