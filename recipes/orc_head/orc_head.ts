// Stylised orc warrior bust — an original design in the chunky hand-painted fantasy-MMO idiom,
// sculpted like a pro bust in stages (see build.ts): block-out from separate masses (egg cranium,
// mid-face block, boat-sail jaw, muzzle, forward-leaning neck into huge trapezius), planes scraped
// in (temple/side planes, jaw corners, under-jaw, sloped forehead, cheek corners), features (sunk
// sockets round separate eyeballs with lids that follow them, broad flat nose, mouth wrapped round
// a teeth cylinder, underbite, lower tusks rooted in the jaw, structured ears), then secondary and
// tertiary forms (furrows, crow's feet, nasolabial folds, veins, a scar) and paint (warm tops, cool
// undersides, flush, war paint). Plate pauldrons with rolled rims, rivets and bone spikes; a
// leather baldric; a fur mantle; a warrior's knot of sculpted locks; a turned plinth.
// Design dossier and proportion anchors: recipes/orc_head/README.md.

import { defineAsset, hex } from '@developerz.ai/ts23d';
import { buildOrc } from './build.ts';
import { ORC_CREASES } from './creases.ts';

export const orc_head = defineAsset({
  name: 'orc_head',
  kind: 'character',
  description:
    'Stylised orc warrior bust: underbite and lower tusks, heavy brow shelf, ember eyes, warrior knot, hunched trapezius, riveted plate pauldrons with bone spikes, fur mantle, leather baldric',
  tags: ['character', 'fantasy', 'orc', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/orc_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.38,
    width: 0.8,
    height: 0.62,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.093,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: 'landmarks.ts: eyes ±0.0465 m (0.31 × the 0.30 m head; human 0.265, ×1.17)',
      },
    ],
  },
  // LOD0 is a hero bust (face, plates, fur, hair all carry detail); LOD2 keeps the silhouette.
  budget: { triangles: [132000, 44000, 3800] },
  // Ember eyes: the whole eyeball glows (dark amber sclera, bright iris).
  glow: [{ parts: ['eye_*'], color: hex('#ff7a1a'), strength: 2.5 }],
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
