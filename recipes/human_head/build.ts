// Human bust assembly: the shared bust builder (../_lib/bust/bust.ts) with the human spec, hair,
// beard (LOD0 hair: the Blender groom, groom.ts) and outfit. Parts: `head`, `bust` (split under the collar), `brooch`, `eye_l` / `eye_r`,
// `plinth`.

import { type BuildContext, hex, sculpt } from '@developerz.ai/ts23d';
import { type BustRecipe, buildBust } from '../_lib/bust/bust.ts';
import { mix } from '../_lib/bust/hair.ts';
import { brooch, outfitEdits } from '../_lib/bust/human/clothes.ts';
import { C, CHARACTER, EAR, EYE, L, SPEC, TORSO } from '../_lib/bust/human/spec.ts';
import { groomHair } from '../_lib/face/hair-groom.ts';
import { HUMAN_GROOM } from './groom.ts';
import { beardline, hairBaseEdits, hairline, humanCardHair } from './hair.ts';

/** The scalp paint: a third of the way root → tip, in shade. */
export const SCALP = mix(mix(C.hairRoot, C.hairTip, 0.35), [0, 0, 0], 0.25);

export const HUMAN_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  zones: {
    lips: C.lips,
    flush: hex('#d39072'),
    socket: hex('#bf8a70'),
    shadow: hex('#9c7a6c'),
    // The painted brow is the skin under the brow cards: a soft brown, not a strip.
    brows: hex('#8a5a40'),
    forehead: hex('#d8a276'),
    lashes: hex('#2a1810'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // An 7 mm curvature stencil: the skull's mesh field rings in 4 mm (blotchy painted crevices).
  paint: { stencil: 0.007, speckle: 0.12 },
  // Hair-coloured scalp and chin under the cards (D57): a shaded mid-brown, so a gap between
  // locks reads as hair in shadow, not a hole.
  scalp: [
    { line: hairline, color: SCALP },
    { line: beardline, color: SCALP, soft: 0.01 },
  ],
  plinth: { radius: 0.13, color: C.plinth },
  cells: { head: [0.0044, 0.008, 0.02], bust: [0.0078, 0.011, 0.024] },
  hair: hairBaseEdits,
  outfit: outfitEdits,
  extras: (_ctx, skin) => ({
    brooch: sculpt({ edits: brooch(skin), resolution: 0.0016, color: C.brass, strip: 'brass' }),
  }),
};

export function buildHuman(ctx: BuildContext): void {
  buildBust(ctx, HUMAN_BUST);
  // LOD0: the cached Blender groom (groom.ts); LOD1, LOD2 and a cache miss: the card hair.
  groomHair(ctx, 'human_head', humanCardHair(HUMAN_BUST, ctx.lod), HUMAN_GROOM);
}
