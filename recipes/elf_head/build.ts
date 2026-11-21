// Elf bust assembly: the shared dressed-bust builder (../_lib/bust/layers.ts) with the elf spec,
// long hair and outfit. The skin parts (`head`, `bust`: pore strip, `skin` finish) are built
// without the body the outfit hides; the garments are their own closed solids, one per material
// strip (clothes.ts): silk tunic, wool cloak and cape, gold braid, merged as `tunic` and
// `clothes` under the same `face` node (they breathe with the chest). Parts: `head`, `bust`
// (split under the collar), `tunic`, `clothes`, `clasp`, `hair`, `eye_l` / `eye_r`, `plinth`.
// LOD2 keeps the long fair hair as a few wide cards and the garments in their colours.

import { type BuildContext, hex, sculpt } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { mix } from '../_lib/bust/hair.ts';
import { buildDressedBust } from '../_lib/bust/layers.ts';
import { armCut } from '../_lib/bust/torso.ts';
import { cardHair } from '../_lib/face/hair-cards.ts';
import { clasp, hiddenBody, outfitEdits, outfitLayers } from './clothes.ts';
import { CAP, elfCardHair, farHair, hairBaseEdits, hairline } from './hair.ts';
import { C, CHARACTER, EAR, EYE, L, NECK, SPEC, TORSO } from './spec.ts';
import { bodyEdits } from './torso.ts';

/** The scalp paint under the cards: the cap's gold in deeper shade (a parting reads as depth). */
export const SCALP = mix(CAP, [0, 0, 0], 0.3);

/** The dressed elf as one sculpt: what the proportion and cloth checks measure and the hair
 *  falls round. */
export const ELF_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // Smooth and youthful: soft planes, high cheekbones, no expression lines, no beard shadow.
  forms: { planes: 0.5, brow: 0.35, cheek: 1.2, jaw: 0.5, neck: 0.7, lines: 0.25, lips: 0.8 },
  // Skin zones: rose on cheeks, nose and ears, cooler sockets, a pale forehead.
  zones: {
    lips: C.lips,
    flush: hex('#e9b9a6'),
    socket: hex('#dab49e'),
    brows: hex('#b09070'),
    forehead: hex('#f4dcc6'),
    lashes: hex('#5a4030'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  saw: armCut(L, TORSO),
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // A wider curvature stencil (the skull's mesh field rings in 4 mm); no vertex speckle (its
  // 6 mm specks added to the sandy grain, D520: the strips carry the pores and freckles).
  paint: { stencil: 0.007 },
  // Fine skin: freckles gathered over the bridge and cheekbones, coarse pores only on the nose
  // and the cheeks' centres (D520).
  complexion: { freckles: 0.85, fine: true },
  // Light through the thin rims and long tips of the ears: a red-orange glow, painted so it
  // reads under the hero's front key and in any engine (D522).
  translucent: hex('#e07a5c'),
  // The scalp under the cards: the cap's shadowed gold, never skin (D57).
  scalp: [{ line: hairline, color: SCALP }],
  plinth: { radius: 0.12, color: C.plinth },
  cells: { head: [0.0064, 0.011, 0.022], bust: [0.01, 0.012, 0.03] },
  pores: true,
  finish: 'skin',
  body: () => bodyEdits(),
  hair: hairBaseEdits,
  outfit: outfitEdits,
  extras: (ctx, skin) => ({
    clasp: sculpt({
      edits: clasp(skin),
      resolution: ctx.pick([0.002, 0.0032, 0.006]),
      color: C.silver,
      strip: 'chrome',
    }),
  }),
};

export function buildElf(ctx: BuildContext): void {
  buildDressedBust(ctx, ELF_BUST, {
    layers: outfitLayers,
    hidden: hiddenBody,
    body: bodyEdits,
    // A season on the road: dust settled on the wool's shoulders and the cape's top.
    wear: {
      layers: ['cloak', 'far'],
      options: {
        name: 'cloak',
        age: 0.4,
        resolution: 0,
        effects: { dust: { amount: 0.45, strength: 0.4, color: [0.62, 0.54, 0.4] } },
      },
      // (An even film on what faces up, in the road's own tan: as scattered grey patches it
      // read as texture noise.)
      even: true,
    },
  });
  // Far LOD: the long fair hair stays as a few wide cards in the near LODs' colours.
  cardHair(ctx, elfCardHair(ELF_BUST, Math.min(ctx.lod, 1)), 'hair', { far: farHair });
}
