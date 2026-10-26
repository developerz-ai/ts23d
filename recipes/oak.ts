// English oak (Quercus robur), open-grown mature specimen: 22 m tall, crown as wide as it is tall,
// 1.3 m trunk at breast height (≈ 4.1 m girth). Spreading crooked limbs, lobed leaf clusters,
// buttressed root flare. The `tree` kind does the botany; this file is the spec. refs/oak.md.

import { treeReal, trees } from '@developerz-ai/ts23d';

const size = { height: 22, spread: 22, dbh: 1.3 };

export const oak = trees.variant({
  name: 'oak',
  description:
    'English oak (Quercus robur), mature open-grown: broad domed crown on a short thick bole',
  sources: [
    'https://en.wikipedia.org/wiki/Quercus_robur (20–40 m; trunk girth 4–12 m)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/english-oak/ (mature height 20–40 m, broad spreading crown)',
  ],
  real: treeReal({ ...size, source: 'refs/oak.md' }),
  params: { species: 'oak', ...size },
});
