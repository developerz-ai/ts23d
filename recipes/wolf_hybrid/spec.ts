// The code half of the hybrid wolf: the same sourced grey wolf as recipes/wolf (README there: the
// measurements, coat logic and photos), copied rather than imported because recipes never import
// each other. Code owns this: skeleton, proportions, stance, mass, rig, LODs.

import { type CreatureSpec, hex } from '@developerz.ai/ts23d';

/** The real numbers (recipes/wolf/README.md table). */
export const REAL = {
  headBody: 1.15,
  shoulder: 0.8,
  tail: 0.42,
  mass: 40,
  head: 0.265,
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
    muzzle: 0.48,
    // Skull 130–150 mm wide on 230–280 mm long: 0.55; the cheek fur (preset) widens the head.
    width: 0.55,
    ears: 'erect',
    earLength: REAL.ear / REAL.head,
    pupil: 'round',
    fangs: true,
  },
  surface: 'fur',
  // Winter guard hair 60–70 mm on the back lies flat: ≈ 3 cm effective shell over the skin.
  coat: 0.03,
  colours: {
    coat: hex('#9a8c78'),
    back: hex('#6a6259'),
    belly: hex('#ddd5c6'),
    legs: hex('#a59886'),
    muzzle: hex('#d6cbb8'),
    tip: hex('#1e1b18'),
    nose: hex('#141110'),
    iris: hex('#c8902a'),
    keratin: hex('#2a2420'),
    mark: hex('#26221f'),
    // The dark line down the front of the forelegs and the grey mask round the eyes.
    foreline: hex('#6a5e52'),
    mask: hex('#6a6058'),
  },
  // Agouti grizzle: banded guard hairs, dark tips dense on the saddle, none on the belly.
  pattern: { kind: 'agouti', scale: 0.012, coverage: 0.45, seed: 41 },
  pose: { head: 12, neck: 40, tail: 'hang' },
};
