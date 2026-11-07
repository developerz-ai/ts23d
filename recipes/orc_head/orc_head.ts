// Stylised orc warrior bust — an original design in the chunky hand-painted fantasy idiom: massive
// underbitten jaw with lower tusks rising outside the upper lip, a heavy brow shelf over small ember
// eyes, flat broad nose, swept ears, a bound warrior's knot, war paint; a hunched brute torso
// (trapezius from ear to shoulder, pectorals, deltoids) under spiked plate pauldrons and a fur
// mantle, cut as a collectible bust on a turned plinth. The `head` kind sculpts it (race preset
// `orc`, chin to crown 0.30 m); this file is the spec.
// Design dossier: recipes/orc_head/README.md.

import { defineAsset, head, hex } from '@developerz.ai/ts23d';

export const orc_head = defineAsset({
  name: 'orc_head',
  kind: 'character',
  description:
    'Stylised orc warrior bust on a plinth: underbite and lower tusks, heavy brow, ember eyes, warrior knot, hunched trapezius, spiked plate pauldrons, fur mantle',
  tags: ['character', 'fantasy', 'orc', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/orc_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.405,
    width: 0.66,
    height: 0.587,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.093,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: '0.155 × 2 head units × 0.30 m',
      },
    ],
  },
  // Measured: sculpt cells 2 % / 4.5 % / 14 % of head height (LOD0/1 also bake vertex AO).
  budget: { triangles: [77000, 15400, 2000] },
  // Ember eyes: the whole eyeball glows (dark amber sclera, bright iris).
  glow: [{ parts: ['eye_*'], color: hex('#ff7a1a'), strength: 2.5 }],
  build(ctx) {
    head(ctx, { race: 'orc' });
  },
});
