// Goblin bust assembly: the shared dressed-bust builder (../_lib/bust/layers.ts) with the goblin
// spec, features (grin, teeth, worried brow, warts), wispy hair and outfit. The skin parts (`head`,
// `bust`: pore strip, `skin` finish) are built without the body the outfit hides; the garments are
// their own closed solids, one per material strip (clothes.ts: linen shirt, leather vest, wool
// hood and scarf), merged as the `clothes` part under the same `face` node
// (they breathe with the chest). Parts: `head`, `bust` (split under the scarf), `clothes`,
// `toggle`, `teeth` (LOD0/1), `hair`, `eye_l` / `eye_r`, `plinth`. LOD2 keeps the ears (features.ts), the garments
// in their colours and a few wisps of hair.

import { type BuildContext, hex, sculpt } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { buildDressedBust } from '../_lib/bust/layers.ts';
import { armCut, neckSeam } from '../_lib/bust/torso.ts';
import { cardHair, farStyle } from '../_lib/face/hair-cards.ts';
import { hiddenBody, outfitEdits, outfitLayers, toggleEdits } from './clothes.ts';
import { farEars, featureEdits, goblinTeeth } from './features.ts';
import { goblinCardHair, hairBaseEdits } from './hair.ts';
import { C, CHARACTER, EAR, EYE, L, LT, NECK, SPEC, TORSO } from './spec.ts';
import { bodyEdits } from './torso.ts';

const SEAM = neckSeam(LT).field;

/** The dressed goblin as one sculpt: what the proportion and cloth checks measure and the hair
 *  falls round. */
export const GOBLIN_BUST: BustRecipe = {
  spec: SPEC,
  skull: CHARACTER,
  // Gnarled: hard planes, bony brow and cheeks, deep lines, a stringy neck.
  forms: { planes: 1.2, brow: 1.3, cheek: 1.3, jaw: 0.8, neck: 1.2, lines: 1.6, lips: 0.6 },
  // Skin zones that read at arm's length: bruise-brown lips, a flushed nose, cheeks and ears,
  // sallow yellow forehead, cold dark sockets.
  zones: {
    lips: C.lips,
    flush: hex('#b07a48'),
    socket: hex('#56622f'),
    brows: hex('#747650'),
    forehead: hex('#a0a854'),
    lashes: hex('#3a3a20'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  saw: armCut(LT, TORSO),
  neck: NECK,
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // A wider curvature stencil (the skull's mesh field rings in 4 mm); a warty hide's speckle.
  paint: { stencil: 0.006, speckle: 0.2 },
  plinth: { radius: 0.1, color: C.plinth },
  cells: { head: [0.006, 0.01, 0.021], bust: [0.01, 0.012, 0.026] },
  pores: true,
  finish: 'skin',
  // The parts split at the neck seam, bent up over the shoulders: the shoulder cloth above the
  // tilted seam (D61) belongs to `bust`, so `head` stays a neck-wide piece seated on it.
  split: (p) => SEAM(p) - 2 * Math.max(0, Math.abs(p[1]) - 0.055),
  body: () => bodyEdits(),
  features: (stage, skin, lod, rng) => featureEdits(stage, skin, lod, rng),
  // The teeth: their own part, finer than the head's cell (features.ts `goblinTeeth`).
  extras: (ctx) => (ctx.lod < 2 ? { teeth: goblinTeeth(ctx.lod) } : {}),
  hair: hairBaseEdits,
  outfit: outfitEdits,
};

export function buildGoblin(ctx: BuildContext): void {
  const lod = ctx.lod;
  const skin = buildDressedBust(ctx, GOBLIN_BUST, {
    layers: outfitLayers,
    hidden: hiddenBody,
    body: bodyEdits,
    // The far LOD keeps its ears as blades the coarse cell can hold.
    built: { hair: (_scalp, l) => (l === 2 ? farEars(GOBLIN_BUST.cells.head[2]) : []) },
    // Years on the road: dust settled on what faces up, the leather scuffed where it is handled.
    wear: {
      options: {
        name: 'clothes',
        age: 0.6,
        resolution: 0,
        under: [0.62, 0.47, 0.33],
        effects: {
          dust: { amount: 0.25, strength: 0.35, color: [0.5, 0.44, 0.34] },
          chips: { amount: 0.04, strength: 0.5 },
        },
      },
    },
  });
  if (lod < 2)
    ctx.part(
      'toggle',
      sculpt({
        edits: toggleEdits(skin),
        resolution: ctx.pick([0.002, 0.004, 0.01]),
        color: C.horn,
      }),
      { parent: 'face' },
    );
  // Far LOD: the crown wisps and ear tufts stay as a handful of wide cards.
  cardHair(ctx, goblinCardHair(GOBLIN_BUST, lod), 'hair', {
    far: (style) => ({
      ...farStyle(style, {
        keep: style.layers.filter((l) => l.kind === 'wisp').map((l) => l.name),
        density: 0.5,
        width: 0.5,
      }),
      cell: style.cell,
    }),
  });
}
