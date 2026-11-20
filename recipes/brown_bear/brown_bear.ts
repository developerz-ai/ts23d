// Brown bear — an adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours, the
// wolf's ursid family member: `familyMember` takes the wolf spec's skeleton (recipes/_lib/creature/wolf-spec.ts) and
// swaps in the ursid preset — plantigrade feet with five clawed toes, a broad dished head with
// round ears, a short thick neck, the shoulder hump, a barrel body with no tuck — at the bear's
// sourced numbers (README.md). Wikidata Q36341 (CC0) pins a mass; Wikipedia gives the ranges.

import { CREATURE_MATERIALS, defineMaterial, type Vec3 } from '@developerz.ai/ts23d';
import { citeWikidata } from '@developerz.ai/ts23d/data';
import { limbMarks } from '../_lib/creature/limb-marks.ts';
import { defineWildCreature } from '../_lib/creature/wild.ts';
import { bearHead } from './head.ts';
import { BEAR, BEAR_DATA, EAR, MASS_CONFLICTS, REAL, WIKIDATA_MASS } from './spec.ts';
import { BEAR_WILD } from './wild.ts';

export { BEAR, BEAR_DATA, BEAR_WILD, MASS_CONFLICTS, REAL, WIKIDATA_MASS };

const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

export const brown_bear = defineWildCreature(
  {
    name: 'brown_bear',
    description:
      'Adult male Eurasian brown bear (Ursus arctos arctos) standing on all fours: 2.05 m head and body, 1.1 m at the shoulder, 400 kg; the grey wolf’s ursid family member — plantigrade, the shoulder hump, broad head, round ears',
    tags: ['creature', 'animal', 'mammal', 'ursid', 'bear', 'family-member', 'sculpt'],
    license: 'CC0-1.0',
    sources: [
      'https://en.wikipedia.org/wiki/Brown_bear (head-body, shoulder, tail, mass range, skull, claws, hump)',
      'https://en.wikipedia.org/wiki/Eurasian_brown_bear (male mass 350–500 kg, coat colour)',
      citeWikidata(BEAR_DATA),
      'recipes/wolf (family base: skeleton) via familyMember, ursid preset',
      'recipes/brown_bear/README.md (dossier, photos per view)',
    ],
    spec: BEAR,
    // The recipe's own ears (head.ts): the root in the crown fur and the hollow's rim are folds.
    creases: [1, -1].map((side) => ({
      name: `ear_${side > 0 ? 'l' : 'r'}`,
      part: 'head',
      at: [EAR.at[0], EAR.at[1] * side, EAR.at[2]] as Vec3,
      radius: EAR.r * 1.5,
      why: 'the ear disc rising out of the crown fur and the hollow inside it',
    })),
    // Cells set directly: 24 mm on the body and 11 mm on the head (the defaults, 21 and 8.5 mm,
    // spent 36 k triangles on a head the groom covers in cards); the far mesh a little finer
    // than the default, so the head keeps its dome and ears at the switch.
    options: {
      strip: FUR,
      cells: { body: [1.15, 1, 0.9], head: [1.3, 1, 0.8] },
      head: bearHead,
      // Plantigrade landmarks under the long coat: elbow point, wrist and carpal pad, patella,
      // the heel and broad hock, five split toes.
      body: limbMarks({ bone: 0.85 }),
    },
    real: {
      length: 2.22,
      width: 0.71,
      height: 1.3,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.3,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'stable', grounded: true },
    // The scarred, rubbed right shoulder and the muddy forelegs to the lens, from standing height.
    hero: { azDeg: -48, elDeg: 12 },
  },
  BEAR_WILD,
);
