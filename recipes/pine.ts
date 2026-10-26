// Scots pine (Pinus sylvestris), mature: 25 m tall, 9 m crown in the top half, 0.6 m DBH. Long
// clean bole turning orange-red up high, flat-topped crown, dark blue-green needle tufts on
// upturned branch tips. The `tree` kind does the botany; this file is the spec. refs/pine.md.

import { treeReal, trees } from '@developerz-ai/ts23d';

const size = { height: 25, spread: 9, dbh: 0.6 };

export const pine = trees.variant({
  name: 'pine',
  description:
    'Scots pine (Pinus sylvestris), mature: tall bare bole, orange upper bark, high flat-topped crown',
  sources: [
    'https://en.wikipedia.org/wiki/Pinus_sylvestris (up to 35 m tall, trunk up to 1 m diameter; orange upper bark)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/scots-pine/ (mature 35 m; flat-topped crown in age)',
  ],
  real: treeReal({ ...size, source: 'refs/pine.md' }),
  params: { species: 'pine', ...size },
});
