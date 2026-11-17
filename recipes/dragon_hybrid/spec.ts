// The code half of the model-tier dragon: an original fantasy drake on the creature kind's
// `quadruped` body plan. The learned rigger gives the model a quadruped's skeleton and no wing
// bones, so the plan has none: the wings ride with the chest, raised, and do not flap. It is
// invented, so there are no sourced measurements: the numbers are this recipe's design spec
// (README.md), read off the concept the model is built from; the anatomy it borrows is named there.

import { type CreatureSpec, hex } from '@developerz.ai/ts23d';

/** The design spec (README.md table), metres and kilograms. */
export const DESIGN = {
  /** Nose to rump. */
  headBody: 3.2,
  /** Shoulder height on all fours. */
  shoulder: 1.6,
  tail: 2.6,
  /** A Nile crocodile of this body length weighs 400–700 kg; a slimmer, longer-legged build. */
  mass: 600,
  head: 0.7,
} as const;

export const DRAKE: CreatureSpec = {
  skeleton: 'quadruped',
  stance: 'digitigrade',
  mass: DESIGN.mass,
  length: DESIGN.headBody,
  height: DESIGN.shoulder,
  head: DESIGN.head,
  neck: 0.9,
  tail: DESIGN.tail,
  surface: 'scales',
  colours: {
    coat: hex('#a83a1f'),
    back: hex('#7d2416'),
    belly: hex('#d9a85c'),
    legs: hex('#8a2c18'),
    muzzle: hex('#b5442a'),
    tip: hex('#3a1410'),
    nose: hex('#2a1210'),
    iris: hex('#e0a020'),
    keratin: hex('#e6d9b8'),
  },
};
