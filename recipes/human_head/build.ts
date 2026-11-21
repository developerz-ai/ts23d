// Human bust assembly: the shared dressed-bust builder (../_lib/bust/layers.ts) with the human
// spec, hair, beard (LOD0 hair: the Blender groom, groom.ts) and outfit. The skin parts (`head`,
// `bust`: pore strip, `skin` finish) are built without the body the outfit hides; the garments
// are their own closed solids, one per layer (clothes.ts): `clothes` (linen shirt, wool tunic,
// braid) and the wool `mantle`, under the same `face` node (they breathe with the chest). Parts: `head`, `bust`
// (split under the collar), `clothes`, `mantle`, `brooch`, `hair`, `eye_l` / `eye_r`, `plinth`.
// LOD2 keeps the brow and nose as masses the coarse cell can hold and the garments' colours.

import { type BuildContext, hex, type SculptEdit, sculpt } from '@developerz.ai/ts23d';
import type { BustRecipe } from '../_lib/bust/bust.ts';
import { structureEdits } from '../_lib/bust/face-forms.ts';
import { mix } from '../_lib/bust/hair.ts';
import { neckEdits } from '../_lib/bust/human/neck.ts';
import { C, CHARACTER, EAR, EYE, L, SK, SPEC, STRUCTURE } from '../_lib/bust/human/spec.ts';
import { chain, cone2, creaseOn } from '../_lib/bust/kit.ts';
import { buildDressedBust } from '../_lib/bust/layers.ts';
import { armCut } from '../_lib/bust/torso.ts';
import { groomHair } from '../_lib/face/hair-groom.ts';
import { HERO_FORMS } from '../_lib/face/planes.ts';
import type { Character } from '../_lib/face/spec.ts';
import { brooch, hiddenBody, outfitEdits, outfitLayers } from './clothes.ts';
import { HUMAN_GROOM } from './groom.ts';
import { beardline, hairBaseEdits, hairline, humanCardHair } from './hair.ts';
import { bodyEdits, TORSO } from './torso.ts';

/** The scalp paint: a third of the way root → tip, in shade. */
export const SCALP = mix(mix(C.hairRoot, C.hairTip, 0.35), [0, 0, 0], 0.25);

/** The shared hero, his shoulders ×0.92 of the base's (the shared spec's ×1.1 stood wider than
 *  the torso under them). */
const HERO: Character = {
  ...CHARACTER,
  race: { ...CHARACTER.race, body: { ...CHARACTER.race.body, shoulders: 0.92 } },
};

/** A pale scar: an old cut through the left brow's tail and down onto the cheekbone. */
const SCAR = hex('#e6b8a4');
export function scarLine(): Array<[number, number, number]> {
  const b = SK.exocanthion;
  return [
    [b[0] + 0.012, Math.abs(b[1]) - 0.004, b[2] + 0.03],
    [b[0] + 0.01, Math.abs(b[1]) + 0.002, b[2] + 0.008],
    [b[0] + 0.008, Math.abs(b[1]) + 0.004, b[2] - 0.022],
  ];
}

/** The dressed hero as one sculpt: what the proportion and cloth checks measure and the hair
 *  falls round. */
export const HUMAN_BUST: BustRecipe = {
  spec: SPEC,
  skull: HERO,
  // The lid fold and the nasolabial fold a fifth deeper than the shared hero's (they read flat).
  forms: { ...HERO_FORMS, lines: 1.2 },
  // Skin zones that read at arm's length: a man who lives outdoors, sun on the nose, cheekbones
  // and ears, a paler forehead under the hair, shaded sockets. (No shaven-beard shadow zone: under
  // the full beard it showed above it as a grey band along the cheek, D523.)
  zones: {
    lips: C.lips,
    flush: hex('#c97a5c'),
    socket: hex('#b07c66'),
    // The painted brow is the skin under the brow cards: a soft brown, not a strip.
    brows: hex('#8a5a40'),
    forehead: hex('#dcaa80'),
    lashes: hex('#2a1810'),
  },
  l: L,
  eye: EYE,
  ear: EAR,
  torso: TORSO,
  saw: armCut(L, TORSO),
  tone: { skin: C.skin, warm: C.warm, cool: C.cool, cavity: C.cavity },
  // An 7 mm curvature stencil: the skull's mesh field rings in 4 mm (blotchy painted crevices).
  paint: { stencil: 0.007, speckle: 0.16 },
  // Hair-coloured scalp and chin under the cards (D57): a shaded mid-brown, so a gap between
  // locks reads as hair in shadow, not a hole; the beard's cheek line fades over 1 cm into the
  // stubble strip's cut hairs (a 1.8 cm paint fade was a muddy grey band, D523).
  scalp: [
    { line: hairline, color: SCALP },
    { line: beardline, color: SCALP, soft: 0.01 },
  ],
  stubble: beardline,
  plinth: { radius: 0.13, color: C.plinth },
  // (The head a little coarser than the bare-headed busts': hair and beard cover half of it.)
  cells: { head: [0.0066, 0.011, 0.026], bust: [0.012, 0.013, 0.03] },
  // Sun freckles over the bridge and cheekbones above the beard (D520).
  complexion: { freckles: 0.35 },
  pores: true,
  finish: 'skin',
  body: () => bodyEdits(),
  features: (stage, skin, lod) => [
    // The bones and the lids over the soft base (D570–D572).
    ...structureEdits(SK, EYE, SPEC.H, skin, STRUCTURE, lod),
    // A man's neck: 118 mm across, sloping into the shoulders (D575).
    ...neckEdits(SK, SPEC.H, skin, { side: 0.008, traps: 0.012 }),
    ...(stage >= 4
      ? [
          creaseOn(skin, scarLine(), 0.0024, 0.0012, {
            blend: 0.002,
            color: SCAR,
            mirror: false,
            tips: 0.3,
          }),
        ]
      : []),
  ],
  hair: hairBaseEdits,
  outfit: outfitEdits,
  extras: (ctx, skin) => ({
    brooch: sculpt({
      edits: brooch(skin),
      resolution: ctx.pick([0.0026, 0.0042, 0.008]),
      color: C.brass,
      strip: 'brass',
    }),
  }),
};

/** The far LOD's face: the brow ridge and the nose as masses its 2 cm cell can hold (the
 *  anatomical ones flatten into the egg). */
export function farFace(): SculptEdit[] {
  const g = SK.glabella;
  const tip = SK.pronasale;
  return [
    cone2([g[0] - 0.008, 0, g[2] - 0.012], [tip[0] - 0.012, 0, tip[2] + 0.004], 0.011, 0.014, {
      blend: 0.008,
      mirror: false,
    }),
    chain(
      [
        [g[0] - 0.012, -0.05, g[2] + 0.002],
        [g[0] - 0.004, 0, g[2] + 0.004],
        [g[0] - 0.012, 0.05, g[2] + 0.002],
      ],
      0.011,
      { blend: 0.01, mirror: false },
    ),
  ];
}

export function buildHuman(ctx: BuildContext): void {
  buildDressedBust(ctx, HUMAN_BUST, {
    layers: outfitLayers,
    hidden: hiddenBody,
    body: bodyEdits,
    built: {
      hair: (scalp, lod) => [...hairBaseEdits(scalp, lod), ...(lod === 2 ? farFace() : [])],
    },
    // Weeks on the road: dust settled on the mantle's shoulders, the wool bleached on top.
    wear: {
      layers: ['mantle', 'far'],
      options: {
        name: 'mantle',
        age: 0.5,
        resolution: 0,
        // (Thin: at a 1 cm vertex spacing heavy dust reads as pale blotches.)
        effects: { dust: { amount: 0.3, strength: 0.2, color: [0.55, 0.47, 0.38] } },
      },
      // An even film on what faces up, as on the elf's cloak: scattered, it read as pale blotches.
      even: true,
    },
  });
  // LOD0: the cached Blender groom (groom.ts); LOD1, LOD2 and a cache miss: the card hair.
  groomHair(ctx, 'human_head', humanCardHair(HUMAN_BUST, ctx.lod), HUMAN_GROOM);
}
