// Stylised goblin bust — an original design in the chunky hand-painted fantasy idiom: huge leaf
// ears, long humped nose, wide toothy grin, big amber eyes, a few wiry hair tufts, warts, and a
// draped hood on narrow shoulders. The `head` kind sculpts it (race preset `goblin`, chin to crown
// 0.19 m); this file is the spec. Design dossier: recipes/goblin_head/README.md.

import { defineAsset, head } from '@developerz-ai/ts23d';

export const goblin_head = defineAsset({
  name: 'goblin_head',
  kind: 'character',
  description:
    'Stylised goblin bust: huge pointed ears, long humped nose, toothy grin, amber eyes, hood',
  tags: ['character', 'fantasy', 'goblin', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/goblin_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.236,
    width: 0.322,
    height: 0.366,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.057,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: '0.15 × 2 × 0.19 m',
      },
    ],
  },
  // Measured: sculpt cells 2 % / 4.5 % / 14 % of head height (LOD0/1 also bake vertex AO).
  budget: { triangles: [55800, 10900, 1560] },
  build(ctx) {
    head(ctx, { race: 'goblin' });
  },
});
