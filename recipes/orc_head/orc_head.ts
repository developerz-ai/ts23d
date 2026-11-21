// Stylised orc warrior bust — an original game-character design: the CC0 anatomical base warped
// to the orc (low sloped vault, brow shelf, small deep-set eyes, broad flat nose, jaw ×1.85 with
// an underbite) and sculpted by the shared skull pipeline (skull → planes → muscles → features →
// skin zones, ../_lib/bust/bust.ts); lower tusks rooted in the jaw (the left one broken), scars
// and warts as strokes, a scowl; a thick neck into huge trapezius; plate pauldrons with bone
// spikes, a leather baldric, a fur mantle, a bead necklace, a warrior's knot and card hair; a
// turned plinth. Skull planes and the nape's break: cranium.ts; the far LOD's solids: far.ts.
// Design dossier, declared race deltas and proportion bands: README.md.

import { defineAsset, headClips, hex } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { portrait } from '../_lib/bust/hero.ts';
import { proportionCheck } from '../_lib/face/proportions.ts';
import { scalpCoverCheck } from '../_lib/face/scalp-check.ts';
import { skinFinish } from '../_lib/face/skin-strip.ts';
import { buildOrc, ORC_BUST } from './build.ts';
import { ORC_CREASES } from './creases.ts';
import { beardRegion } from './hair.ts';
import { C } from './palette.ts';
import { ORC_PROPORTIONS, SK } from './spec.ts';

export const orc_head = defineAsset({
  // Blink, talk and breathe morphs on `head` and `bust` under the `face` node (build.ts).
  clips: headClips('face'),
  name: 'orc_head',
  kind: 'character',
  description:
    'Stylised orc warrior bust: heavy brow shelf, small deep-set ember eyes, broad flat nose, massive underbite jaw with lower tusks rooted in it, scars and warts, thick neck into huge trapezius, riveted plate pauldrons with bone spikes, fur mantle, leather baldric, warrior knot',
  tags: ['character', 'fantasy', 'orc', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: [
    'recipes/orc_head/README.md (design dossier: declared race deltas, proportion bands, palette)',
    'docs/research/face-base.md (CC0 MakeHuman base head and its landmarks)',
  ],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    // 0.41 m: the anatomy push (muzzle 6 % H, chin 7.5 % H forward) and the full beard.
    length: 0.41,
    // 0.73 m across the pauldrons, seated on the deltoids (0.8 m when they hung beside them).
    width: 0.73,
    height: 0.62,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.076,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'spec.ts: the base IPD (0.26 H) at eyes.spacing 1.0 on the 0.30 m head',
      },
    ],
  },
  // LOD0: the skull-stage head ≈ 37k (its eyes, ears and mouth meshed finer), the card beard and
  // brows ≈ 17k, plates, spikes, fur and the knot ≈ 41k; LOD2 is built, not decimated (far.ts):
  // revolved pauldrons and spikes, a solid beard, and half its triangles on the head.
  // Draws: skin, face-node gear, corneas, hair cards.
  budget: { triangles: [118000, 32000, 4400], draws: 4 },
  // Ember eyes: the whole eyeball glows (dark amber sclera, bright iris).
  glow: [{ parts: ['eye_*'], color: hex('#ff7a1a'), strength: 2.5 }],
  // Measured facial proportions against the declared orc bands (README "Proportions"), every LOD.
  checks: [
    proportionCheck('orc_head', SK, () => bustEdits(ORC_BUST, 2, 1).skin.field, ORC_PROPORTIONS),
    // No bare green chin under the beard cards (D57).
    scalpCoverCheck({
      part: 'head',
      line: beardRegion,
      hair: C.hairRoot,
      skin: C.skin,
      // The beard's painted edge ramps over 8 mm (+ its jitter): the chin is full past 1 cm.
      depth: 0.01,
    }),
  ],
  // The eyeballs' cornea: a clear lacquer over the painted iris (KHR_materials_clearcoat).
  // The cornea's lacquer, and the hide: the pore strip's roughness under a dull green sheen.
  // A portrait: the bust fills the frame (the default orbit leaves the face a thumbnail).
  hero: portrait(0.62, { fill: 1.12, at: 0.6 }),
  finishes: {
    cornea: { clearcoat: 1, clearcoatRoughness: 0.04 },
    skin: skinFinish('#5c6a3c'),
  },
  art: { focal: 'head' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // landmarks and geometry that sculpt it (creases.ts) — never an area.
  creases: ORC_CREASES,
  build(ctx) {
    buildOrc(ctx);
  },
});
