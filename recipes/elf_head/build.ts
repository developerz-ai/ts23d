// Elf bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the elf spec, long hair
// locks and outfit. Parts: `head`, `bust` (split under the collar), `clasp`, `eye_l` / `eye_r`,
// `plinth`.

import { type BuildContext, hex, sculpt } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { mix } from '../_lib/bust/hair.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { clasp, outfitEdits } from './clothes.ts';
import { CAP, elfCardHair, hairBaseEdits, hairline } from './hair.ts';
import { C, CHARACTER, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';

/** The scalp paint under the cards: the cap's gold in deeper shade (a parting reads as depth). */
export const SCALP = mix(CAP, [0, 0, 0], 0.3);

export const ELF_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // Smooth and youthful: soft planes, high cheekbones, no expression lines, no beard shadow.
  forms: { planes: 0.5, brow: 0.35, cheek: 1.2, jaw: 0.5, neck: 0.7, lines: 0.25, lips: 0.8 },
  zones: {
    lips: C.lips,
    flush: hex('#efbea6'),
    socket: hex('#d6b4a4'),
    brows: hex('#b09070'),
    forehead: hex('#f2d4bc'),
    lashes: hex('#5a4030'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // A wider curvature stencil (the skull's mesh field rings in 4 mm) and a faint pore speckle.
  paint: { stencil: 0.007, speckle: 0.08 },
  // The scalp under the cards: the cap's shadowed gold, never skin (D57).
  scalp: [{ line: hairline, color: SCALP }],
  plinth: { radius: 0.12, color: C.plinth },
  cells: { head: [0.0042, 0.008, 0.02], bust: [0.0078, 0.011, 0.024] },
  hair: hairBaseEdits,
  outfit: outfitEdits,
  extras: (_ctx, skin) => ({
    clasp: sculpt({ edits: clasp(skin), resolution: 0.0014, color: C.silver, strip: 'chrome' }),
  }),
};

export function buildElf(ctx: BuildContext): void {
  buildBust(ctx, ELF_BUST);
  cardHair(ctx, elfCardHair(ELF_BUST, ctx.lod));
}
