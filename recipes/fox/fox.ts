// Red fox — an adult Vulpes vulpes standing alert in winter coat, the wolf's canid family member:
// the wolf spec (recipes/_lib/creature/wolf-spec.ts) supplies the skeleton, build and face; `familyMember` scales them
// to the fox's sourced numbers (README.md) with head-body allometry. Wikidata Q8332 (CC0) pins the
// shoulder height; the rest is cited from Wikipedia: Red fox. What makes it a fox and not a small
// wolf is here: the long white-tipped brush, big black-backed ears, slim muzzle, black stockings.

import { CREATURE_MATERIALS, defineMaterial } from '@developerz.ai/ts23d';
import { citeWikidata } from '@developerz.ai/ts23d/data';
import { limbMarks } from '../_lib/creature/limb-marks.ts';
import { defineWildCreature } from '../_lib/creature/wild.ts';
import { facePlanes } from '../_lib/creature/wild-head.ts';
import { FOX, FOX_DATA, REAL } from './spec.ts';
import { FOX_WILD } from './wild.ts';

export { FOX, FOX_DATA, FOX_WILD, REAL };

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

export const fox = defineWildCreature(
  {
    name: 'fox',
    description:
      'Adult red fox (Vulpes vulpes) standing alert in winter coat: 0.74 m head and body, 0.42 m brush, 0.425 m at the shoulder, 7.5 kg; the grey wolf’s canid family member, scaled from its skeleton',
    tags: ['creature', 'animal', 'mammal', 'canid', 'fox', 'family-member', 'sculpt'],
    license: 'CC0-1.0',
    sources: [
      'https://en.wikipedia.org/wiki/Red_fox (head-body, tail, shoulder, mass, skull, ears, coat)',
      citeWikidata(FOX_DATA),
      'recipes/wolf (family base: skeleton, build, face) via familyMember',
      'recipes/fox/README.md (dossier, photos per view)',
    ],
    spec: FOX,
    // The kind's default cells follow the limb radius: 4.7 mm on this fox's body and 2.9 mm on
    // its head, finer than a 74 cm, 7.5 kg animal needs. × 1.6 (7.5 mm) and × 1.5 (4.3 mm) still
    // hold the toes, the lids and the ear cups: 84 k triangles at LOD0, 34 k of them the body.
    options: {
      strip: FUR,
      cells: { body: [1.6, 1.1, 0.9], head: [1.5, 1, 0.8] },
      // Brow shelf, cheekbone and the hollow under the eye; the dark lid rim (the fox's tear line).
      head: (l) => facePlanes(l, { rim: [0.03, 0.022, 0.018] }),
      // A fox's legs are lean under the stockings: elbow point, carpal pad, patella, the hock's
      // point and Achilles cord, split toes (1 × read as smooth tubes at hero size).
      body: limbMarks({ bone: 1.25, hollow: 1.5, toes: 1.4 }),
    },
    real: {
      length: 1.2,
      width: 0.18,
      height: 0.56,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.3,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'friendly', grounded: true },
    // Side-on enough for the brush, the stockings and the snowed back to read at once.
    hero: { azDeg: -55, elDeg: 10 },
  },
  FOX_WILD,
);
