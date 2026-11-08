// Elf bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the elf spec, long hair
// locks and outfit. Parts: `head`, `bust` (split under the collar), `clasp`, `eye_l` / `eye_r`,
// `plinth`.

import { type BuildContext, sculpt } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { clasp, outfitEdits } from './clothes.ts';
import { hairEdits } from './hair.ts';
import { C, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';

export const ELF_BUST: BustRecipe = {
  spec: SPEC,
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  plinth: { radius: 0.12, color: C.plinth },
  cells: { head: [0.0042, 0.008, 0.02], bust: [0.0065, 0.011, 0.024] },
  hair: hairEdits,
  outfit: outfitEdits,
  extras: (_ctx, skin) => ({
    clasp: sculpt({ edits: clasp(skin), resolution: 0.0014, color: C.silver, strip: 'chrome' }),
  }),
};

export function buildElf(ctx: BuildContext): void {
  buildBust(ctx, ELF_BUST);
}
