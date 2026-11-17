// The code half of the model-tier bear: an average adult Eurasian brown bear, the wolf's ursid
// family member like recipes/brown_bear, at smaller sourced numbers. recipes/brown_bear is a big
// male (2.1 m, 1.1 m at the shoulder, 400 kg); an image-to-3D model draws an average animal, and
// a model is registered to a plan, not stretched onto one, so this recipe declares the animal
// the model shows. Every number is inside the ranges of recipes/brown_bear/README.md.

import { type CreatureSpec, FAMILY_PRESETS, familyMember, hex } from '@developerz.ai/ts23d';
import { WOLF } from '../wolf/wolf.ts';

/** The real numbers (README.md table; ranges from recipes/brown_bear/README.md). */
export const REAL = {
  /** Head + body 1.0–2.8 m (Wikipedia: Brown bear). */
  headBody: 1.7,
  /** Shoulder up to 1.5 m; an average adult on all fours ≈ 1.0 (estimate, as in brown_bear). */
  shoulder: 1.0,
  /** Tail 6–22 cm. */
  tail: 0.1,
  /** Species range 80–600 kg; an average adult. */
  mass: 250,
  /** Skull 31.5–45.5 cm in males, smaller in females; the furred head. */
  head: 0.4,
  ear: 0.12,
} as const;

export const BEAR: CreatureSpec = familyMember(WOLF, {
  family: 'ursid',
  mass: REAL.mass,
  length: REAL.headBody,
  height: REAL.shoulder,
  tail: REAL.tail,
  head: REAL.head,
  ear: REAL.ear,
  colours: {
    coat: hex('#6b4a2e'),
    back: hex('#5e4026'),
    belly: hex('#4a3322'),
    legs: hex('#2a1c13'),
    muzzle: hex('#8f6e4e'),
    tip: hex('#3a281b'),
    nose: hex('#141110'),
    iris: hex('#3a2414'),
    keratin: hex('#b9ad98'),
  },
  pattern: { kind: 'agouti', scale: 0.02, coverage: 0.3, seed: 7 },
  overrides: {
    coat: 0.045,
    face: { ...FAMILY_PRESETS.ursid.face, width: 0.62, muzzle: 0.38 },
    build: { ...FAMILY_PRESETS.ursid.build, ruff: 0.045 },
  },
});
