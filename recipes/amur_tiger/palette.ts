// The tiger's palette (linear RGB from sRGB swatches sampled off the README's photos): the pale
// rusty-orange Amur winter ground colour, the deeper dorsal orange, the white underside and mask,
// near-black stripes, and the small accents of the face (nose leather, lips, eyes, ear ocelli).

import { hex, type Vec3 } from '@developerz.ai/ts23d';

export const C = {
  /** Ground colour of the flank (winter coat: pale, yellow-orange). */
  orange: hex('#d27a30'),
  /** Along the spine: deeper, redder. */
  back: hex('#b45a1c'),
  /** Lower flank / leg fronts where orange fades toward white: paler, yellower. */
  orangePale: hex('#e3a35c'),
  /** The white underside, muzzle, cheeks, eye patches, inner legs. */
  white: hex('#ebe3d3'),
  /** White in shadow (belly underside), a little warm-grey. */
  whiteShade: hex('#cfc4b0'),
  /** Stripes: near-black with a brown cast. */
  stripe: hex('#1a120d'),
  /** Stripe edges / thin broken stripes: dark brown. */
  stripeBrown: hex('#3a2416'),
  /** Nose leather: dusky pink, darker rim. */
  nose: hex('#c27a76'),
  noseRim: hex('#2a1a16'),
  /** Lip line and eye rims. */
  lip: hex('#1c1310'),
  /** Paw pads: dark, slightly warm. */
  pad: hex('#2e2421'),
  claw: hex('#d9ccb4'),
  clawTip: hex('#f0e8da'),
  tooth: hex('#efe5cc'),
  toothRoot: hex('#d6c39a'),
  gum: hex('#7a3a3c'),
  tongue: hex('#c66a6e'),
  mouth: hex('#3a1618'),
  /** Eye: amber iris, black round pupil, sclera (barely visible). */
  iris: hex('#d0942a'),
  irisRim: hex('#5a3a12'),
  pupil: hex('#060404'),
  sclera: hex('#cdbb9c'),
  /** Ears: black backs, a white ocellus, pale fur inside the pinna. */
  earBack: hex('#161110'),
  ocellus: hex('#f2ede2'),
  earInside: hex('#f1ece2'),
  /** Pink inside the pinna where the fur thins. */
  earSkin: hex('#b88a7e'),
} as const;

/** Claws: horn-coloured root, pale translucent tip. */
export const CLAW: readonly [Vec3, Vec3, Vec3] = [C.claw, C.claw, C.clawTip];
/** Teeth: yellowed root, ivory crown. */
export const TOOTH: readonly [Vec3, Vec3, Vec3] = [C.toothRoot, C.tooth, C.tooth];
