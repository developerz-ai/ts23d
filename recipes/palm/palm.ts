// Coconut palm (Cocos nucifera), mature: 20 m bowed stem of 0.35 m, ~22 pinnate fronds 4–6 m
// long forming a 9 m crown, a hand of coconuts under the frond bases. The `tree` kind does the
// botany; this file is the spec. recipes/palm/README.md.

import { grove } from '../_lib/finish/grove.ts';

const size = { height: 20, spread: 9, dbh: 0.35 };

export const palm = grove({
  species: 'palm',
  size,
  bark: 'bark_oak',
  moss: 0.0,
  floor: 'sand',
  floorRadius: 3.5,

  name: 'palm',
  description:
    'Coconut palm (Cocos nucifera): slender bowed ringed stem, crown of drooping pinnate fronds',
  sources: [
    'https://en.wikipedia.org/wiki/Coconut (up to 30 m; pinnate leaves 4–6 m long)',
    'https://en.wikipedia.org/wiki/Cocos_nucifera',
  ],
  source: 'recipes/palm/README.md',
});
