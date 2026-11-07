// Stylised human hero bust — an original design in the chunky hand-painted fantasy idiom:
// classical proportions (eye line at half height, brow/nose/chin thirds) pushed slightly heroic —
// square jaw, strong brow — with short swept hair, a short beard and moustache, a blue tunic,
// leather collar and cloak roll. The `head` kind sculpts it (race preset `human`, chin to crown
// 0.23 m); this file is the spec. Design dossier: recipes/human_head/README.md.

import { defineAsset, head } from '@developerz-ai/ts23d';

export const human_head = defineAsset({
  name: 'human_head',
  kind: 'character',
  description:
    'Stylised human hero bust: square jaw, swept hair, short beard, blue tunic and leather cloak roll',
  tags: ['character', 'fantasy', 'human', 'bust', 'sculpt'],
  license: 'CC0-1.0',
  sources: ['recipes/human_head/README.md (design dossier: proportions, palette, references)'],
  // Design spec, not a real-world one: overall bust size and eye spacing from the dossier.
  real: {
    length: 0.247,
    width: 0.464,
    height: 0.439,
    measures: [
      {
        label: 'eye spacing (pupil to pupil)',
        value: 0.0621,
        axis: 'y',
        between: ['eye_l', 'eye_r'],
        source: '0.135 × 2 × 0.23 m — adult interpupillary ≈ 62 mm',
      },
    ],
  },
  // Measured: sculpt cells 2 % / 4.5 % / 14 % of head height (LOD0/1 also bake vertex AO).
  budget: { triangles: [64000, 12700, 1720] },
  build(ctx) {
    head(ctx, { race: 'human' });
  },
});
