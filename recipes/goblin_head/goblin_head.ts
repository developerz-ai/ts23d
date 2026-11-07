// Stylised goblin bust — an original design in the chunky hand-painted fantasy idiom: huge leaf
// ears, a long hooked nose, a wide grin of small pointed teeth, big amber eyes under heavy lids, a
// worried creased brow, pale wispy hair, warts; a skinny neck and bony shoulders in a linen shirt,
// leather vest, strap, knotted scarf and a hood worn down, cut as a collectible bust on a turned
// plinth. The `head` kind sculpts it (race preset `goblin`, chin to crown 0.19 m); this file is the
// spec. Design dossier: recipes/goblin_head/README.md.

import { defineAsset, head } from '@developerz.ai/ts23d';

export const goblin_head = defineAsset({
  name: 'goblin_head',
  kind: 'character',
  description:
    'Stylised goblin bust on a plinth: huge pointed ears, long hooked nose, toothy grin, heavy-lidded amber eyes, wispy hair, leather vest and scarf',
  tags: ['character', 'fantasy', 'goblin', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/goblin_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.227,
    width: 0.342,
    height: 0.372,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.0589,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: '0.155 × 2 × 0.19 m',
      },
    ],
  },
  // Measured: sculpt cells 2 % / 4.5 % / 14 % of head height (LOD0/1 also bake vertex AO).
  budget: { triangles: [55800, 10900, 1560] },
  build(ctx) {
    head(ctx, { race: 'goblin' });
  },
});
