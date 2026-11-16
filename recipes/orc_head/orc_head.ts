// Stylised orc warrior bust — an original game-character design: the CC0 anatomical base warped
// to the orc (low sloped vault, brow shelf, small deep-set eyes, broad flat nose, jaw ×1.85 with
// an underbite) and sculpted by the shared skull pipeline (skull → planes → muscles → features →
// skin zones, ../_lib/bust/bust.ts); lower tusks rooted in the jaw (the right one broken), scars
// and warts as strokes, a scowl; a thick neck into huge trapezius; plate pauldrons with bone
// spikes, a leather baldric, a fur mantle, a bead necklace, a warrior's knot and card hair; a
// turned plinth. Design dossier, declared race deltas and proportion bands: README.md.

import { defineAsset, hex } from '@developerz.ai/ts23d';
import { bustEdits } from '../_lib/bust/bust.ts';
import { proportionCheck } from '../_lib/face/proportions.ts';
import { buildOrc, ORC_BUST } from './build.ts';
import { ORC_CREASES } from './creases.ts';
import { ORC_PROPORTIONS, SK } from './spec.ts';

export const orc_head = defineAsset({
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
    length: 0.38,
    width: 0.8,
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
  // LOD0 is a hero bust: the skull-stage head (≈ 65k, its eyes and ears meshed finer), plates,
  // spikes, fur, the knot and card hair all carry detail; LOD2 keeps the silhouette and tusks.
  budget: { triangles: [172000, 46000, 5000] },
  // Ember eyes: the whole eyeball glows (dark amber sclera, bright iris).
  glow: [{ parts: ['eye_*'], color: hex('#ff7a1a'), strength: 2.5 }],
  // Measured facial proportions against the declared orc bands (README "Proportions"), every LOD.
  checks: [
    proportionCheck('orc_head', SK, () => bustEdits(ORC_BUST, 2, 1).skin.field, ORC_PROPORTIONS),
  ],
  // The eyeballs' cornea: a clear lacquer over the painted iris (KHR_materials_clearcoat).
  finishes: { cornea: { clearcoat: 1, clearcoatRoughness: 0.04 } },
  art: { focal: 'head' },
  // Intended creases (QA `connections` skips them): one small region per sculpted fold, from the
  // landmarks and geometry that sculpt it (creases.ts) — never an area.
  creases: ORC_CREASES,
  build(ctx) {
    buildOrc(ctx);
  },
});
