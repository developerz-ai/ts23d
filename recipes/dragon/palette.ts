// Cinderhorn's palette (linear RGB from the sRGB swatches in README.md) and the colour bands every
// module shares: back → flank → belly, bone horn/claw bands, membrane, mouth, eyes.

import { hex, type Vec3 } from '@developerz.ai/ts23d';

export const C = {
  back: hex('#7a1e18'),
  backDeep: hex('#5c1410'),
  flank: hex('#a83a1f'),
  ember: hex('#c8572a'),
  belly: hex('#d9a85c'),
  bellySeam: hex('#7a4a22'),
  scaleSeam: hex('#3a0c0a'),
  hornRoot: hex('#4a3428'),
  horn: hex('#e8d9b8'),
  hornTip: hex('#3a2a22'),
  claw: hex('#2e2420'),
  clawRoot: hex('#8a7a62'),
  tooth: hex('#f1e6cc'),
  toothRoot: hex('#b8975a'),
  gum: hex('#5a1414'),
  tongue: hex('#b2384a'),
  mouth: hex('#3a0a0c'),
  membrane: hex('#c4502a'),
  membraneEdge: hex('#6a1c12'),
  vein: hex('#8a2a18'),
  eye: hex('#ffcc33'),
  iris: hex('#ff8a1a'),
  pupil: hex('#140804'),
  lid: hex('#4a1210'),
} as const;

/** Horn / spine bands root → mid → tip. */
export const HORN: readonly [Vec3, Vec3, Vec3] = [C.hornRoot, C.horn, C.hornTip];
/** Claws: pale root, dark hooked tip. */
export const CLAW: readonly [Vec3, Vec3, Vec3] = [C.clawRoot, C.claw, C.claw];
/** Teeth: yellowed root, ivory, pale tip. */
export const TOOTH: readonly [Vec3, Vec3, Vec3] = [C.toothRoot, C.tooth, C.tooth];
/** Back spines: dark crimson root, ember middle, bone tip. */
export const SPINE: readonly [Vec3, Vec3, Vec3] = [C.backDeep, C.ember, C.horn];
