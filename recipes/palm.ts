// Coconut palm (Cocos nucifera), mature: 20 m bowed stem of 0.35 m, ~22 pinnate fronds 4–6 m
// long forming a 9 m crown, a hand of coconuts under the frond bases. The `tree` kind does the
// botany; this file is the spec. refs/palm.md.

import { treeReal, trees } from '@developerz-ai/ts23d';

const size = { height: 20, spread: 9, dbh: 0.35 };

export const palm = trees.variant({
  name: 'palm',
  description:
    'Coconut palm (Cocos nucifera): slender bowed ringed stem, crown of drooping pinnate fronds',
  sources: [
    'https://en.wikipedia.org/wiki/Coconut (up to 30 m; pinnate leaves 4–6 m long)',
    'https://en.wikipedia.org/wiki/Cocos_nucifera',
  ],
  real: treeReal({ ...size, source: 'refs/palm.md' }),
  params: { species: 'palm', ...size },
});
