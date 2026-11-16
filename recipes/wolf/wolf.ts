// Grey wolf — an adult Eurasian wolf (Canis lupus lupus) standing relaxed in winter coat, built
// with the `creature` kind from a handful of sourced numbers (README.md: measurements, coat logic,
// photos per view). Everything else — skeleton landmarks, digitigrade legs, allometric limb
// thickness, head with seated eyes and grown ears, coat zones, creases, densities, balance — is
// the kind's job; this file is the dossier as data.

import {
  CREATURE_MATERIALS,
  type CreatureSpec,
  defineCreature,
  defineMaterial,
  hex,
} from '@developerz.ai/ts23d';

// D24: a neutral-albedo fur strip, so the grizzled grey/ochre vertex colour is not muddied.
const FUR = defineMaterial(CREATURE_MATERIALS.fur_neutral);

/** The real numbers (README table). */
export const REAL = {
  /** Head + body, nose → tail root (105–160 cm total length; mid-sized adult). */
  headBody: 1.15,
  shoulder: 0.8,
  tail: 0.42,
  /** Adult mean ≈ 36–38.5 kg; males 40. */
  mass: 40,
  /** Skull 230–280 mm; the furred head ≈ +1 cm. */
  head: 0.265,
  /** Ear height 90–110 mm. */
  ear: 0.1,
} as const;

export const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  // Canid defaults: orbit convergence 50.4° (Heesy 2004, Canis), 5 digits fore (the dewclaw) and
  // 4 hind, fore share 55–66 % (dogs 60.4 %): docs/research/animal-anatomy.md.
  family: 'canid',
  stance: 'digitigrade',
  mass: REAL.mass,
  length: REAL.headBody,
  height: REAL.shoulder,
  head: REAL.head,
  // Atlas → C7 along the neck, carried low and forward (estimate from skeleton photos, unverified).
  neck: 0.28,
  tail: REAL.tail,
  // Chest depth ½ the withers (elbow at the chest floor), narrow chest, the waist tucked to ⅔ of
  // the chest depth; bushy winter tail; the shoulder/neck mane (110–130 mm hair).
  build: { depth: 0.5, width: 0.55, limbs: 1, tailGirth: 3.2, ruff: 0.04, tuck: 0.66 },
  face: {
    preset: 'canid',
    // Stop → nose ≈ 0.46 of the furred head in side photos (the forehead fur shortens it from the
    // skull's 0.48); a clear stop and a cheek ruff flaring past the zygomata (README photos).
    muzzle: 0.46,
    // Skull 130–150 mm wide on 230–280 mm long: 0.55; the cheek ruff widens the furred head.
    width: 0.55,
    tip: 0.1,
    stop: 0.22,
    // A full winter ruff (≥ 0.15 grows the lifted ruff cards); the head mass keeps the fore share ≤ 66 %.
    cheek: 0.15,
    ears: 'erect',
    earLength: REAL.ear / REAL.head,
    pupil: 'round',
    fangs: true,
  },
  surface: 'fur',
  // Winter guard hair 60–70 mm on the back lies flat: ≈ 3 cm effective shell over the skin.
  coat: 0.03,
  colours: {
    // Tawny-grey flanks and legs under a grizzled dark saddle; cream belly, throat, cheeks and
    // muzzle sides; a tawny bridge (README colour notes, reference photos).
    coat: hex('#a48e72'),
    back: hex('#5e564d'),
    belly: hex('#e4ddd0'),
    legs: hex('#b49874'),
    muzzle: hex('#e8e2d6'),
    bridge: hex('#a8845e'),
    tip: hex('#1e1b18'),
    nose: hex('#141110'),
    iris: hex('#c8902a'),
    keratin: hex('#2a2420'),
    mark: hex('#26221f'),
    // The dark line down the front of the forelegs and the grey mask round the eyes.
    foreline: hex('#6a5e52'),
    mask: hex('#4e4842'),
  },
  // Agouti grizzle: banded guard hairs, dark tips dense on the saddle, none on the belly.
  pattern: { kind: 'agouti', scale: 0.012, coverage: 0.45, seed: 41 },
  pose: { head: 12, neck: 40, tail: 'hang' },
};

export const wolf = defineCreature({
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
  options: { strip: FUR },
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
  budget: { triangles: [150000, 35000, 4000] },
  art: { focal: 'head', shape: 'friendly', grounded: true },
});
