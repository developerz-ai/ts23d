// Stylised orc warrior bust — an original design in the chunky hand-painted fantasy idiom: massive
// underbitten jaw with lower tusks, heavy scowling brow over small ember eyes, flat broad nose,
// pointed swept ears, top-knot, war-paint stripes, layered spiked pauldrons and a fur mantle. The
// `head` kind sculpts it (race preset `orc`, chin to crown 0.30 m); this file is the spec.
// Design dossier: recipes/orc_head/README.md.

import { defineAsset, head, hex } from '@developerz.ai/ts23d';

export const orc_head = defineAsset({
  name: 'orc_head',
  kind: 'character',
  description:
    'Stylised orc warrior bust: underbite and lower tusks, heavy brow, ember eyes, top-knot, spiked pauldrons, fur mantle',
  tags: ['character', 'fantasy', 'orc', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/orc_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.338,
    width: 0.742,
    height: 0.583,
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
