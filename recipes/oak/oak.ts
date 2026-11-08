// English oak (Quercus robur), open-grown mature specimen: 22 m tall, crown as wide as it is tall,
// 1.3 m trunk at breast height (≈ 4.1 m girth). Spreading crooked limbs, lobed leaf clusters,
// buttressed root flare. The `tree` kind does the botany, `grove` the bark strip, moss and floor. recipes/oak/README.md.

import { hex } from '@developerz.ai/ts23d';
import { grove } from '../_lib/finish/grove.ts';

const size = { height: 22, spread: 22, dbh: 1.3 };

export const oak = grove({
  species: 'oak',
  size,
  bark: 'bark_oak',
  moss: 0.7,
  floor: 'leaf_litter',
  floorRadius: 8,
  floorTint: hex('#a89884'),

  name: 'oak',
  description:
    'English oak (Quercus robur), mature open-grown: broad domed crown on a short thick bole',
  sources: [
    'https://en.wikipedia.org/wiki/Quercus_robur (20–40 m; trunk girth 4–12 m)',
    'https://www.woodlandtrust.org.uk/trees-woods-and-wildlife/british-trees/a-z-of-british-trees/english-oak/ (mature height 20–40 m, broad spreading crown)',
  ],
  source: 'recipes/oak/README.md',
});
