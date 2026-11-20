// Grey wolf — an adult Eurasian wolf (Canis lupus lupus) standing relaxed in winter coat, built
// with the `creature` kind from a handful of sourced numbers (README.md: measurements, coat logic,
// photos per view). Everything else — skeleton landmarks, digitigrade legs, allometric limb
// thickness, head with seated eyes and grown ears, coat zones, creases, densities, balance — is
// the kind's job. The spec (the dossier as data) is recipes/_lib/creature/wolf-spec.ts, shared with
// the fox and the bear; the season outdoors is wild.ts, the head's own forms head.ts.

import { CREATURE_MATERIALS, defineMaterial } from '@developerz.ai/ts23d';
import { limbMarks } from '../_lib/creature/limb-marks.ts';
import { defineWildCreature } from '../_lib/creature/wild.ts';
import { WOLF_REAL as REAL, WOLF } from '../_lib/creature/wolf-spec.ts';
import { wolfHead } from './head.ts';
import { WOLF_WILD } from './wild.ts';

export { REAL, WOLF, WOLF_WILD };

// D24: a neutral-albedo fur strip, so the grizzled grey/ochre vertex colour is not muddied.
const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

export const wolf = defineWildCreature(
  {
    name: 'wolf',
    description:
      'Adult grey wolf (Canis lupus lupus) standing relaxed in winter coat: 1.15 m head and body, 0.42 m tail, 0.80 m at the shoulder, 40 kg; built with the creature kind from sourced numbers',
    tags: ['creature', 'animal', 'mammal', 'canid', 'wolf', 'sculpt'],
    license: 'CC0-1.0',
    sources: [
      'https://en.wikipedia.org/wiki/Wolf (length, shoulder height, tail, mass, skull, ears, fur, colour; after Heptner & Naumov 1998, Mech 1970)',
      'Campione & Evans 2012, BMC Biology 10:60 (limb allometry, via the creature kind)',
      'recipes/wolf/README.md (dossier, photos per view)',
    ],
    spec: WOLF,
    // Cells set directly: the default (0.165 × the limb radius, 8.9 mm) spent 74 k triangles on
    // smooth flanks under the cards; 14 mm on the body (13 mm with the split toes took LOD0 to
    // 120 k, D484) and 6.4 mm on the head hold every form
    // and leave the triangles to the coat. The far mesh is finer than the default (× 0.85 and
    // × 0.75): a head of 1 000 triangles keeps its wedge and ears at the switch.
    options: {
      strip: FUR,
      cells: { body: [1.6, 1.05, 0.85], head: [1.3, 1, 0.75] },
      head: wolfHead,
      // Elbow point, carpal pad, patella, the hock's point and Achilles cord, split toes: a lean
      // runner's legs show their bones through the short leg coat (1 × read as smooth tubes).
      body: limbMarks({ bone: 1.35, hollow: 1.6, toes: 1.4 }),
    },
    // Overall box measured off the posed skeleton (nose → hanging tail, paws → ear tips). Width is
    // the coated width: the README's 0.27 m is the body; winter guard hair (60–70 mm mid-back, up to 110–130 mm on the mane;
    // README coat table) stands ~1 cm proud on each flank, so the outline is ~0.29 m.
    real: {
      length: 1.31,
      width: 0.29,
      height: 0.9,
      tolerance: 0.05,
      mass: REAL.mass,
      massTolerance: 0.25,
    },
    budget: { triangles: [150000, 30000, 4000] },
    art: { focal: 'head', shape: 'friendly', grounded: true },
    // The scarred, mud-splashed right side to the lens, low enough to read the profile.
    hero: { azDeg: -52, elDeg: 10 },
  },
  WOLF_WILD,
);
