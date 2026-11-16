// Orc bust spec: the CC0 base warped to the orc (../_lib/face/races.ts ORC, pushed to this design)
// and placed in the frame the armour, fur and plinth were built for (menton 0.285 → crown 0.585:
// H 0.30 m, ×1.3 the human head). Declared race deltas vs the human, each with its reason in the
// README "Proportions": low sloped vault, brow shelf, small deep-set eyes, broad flat nose, a
// muzzle with an underbite on a jaw ×1.75, a thick neck into huge trapezius. Character knobs, eye
// spec and the proportion bands the build is checked against.

import type { EarSpec } from '../_lib/bust/ear.ts';
import type { EyeSpec } from '../_lib/bust/eye.ts';
import { type HeadSpec, HUMAN, landmarks } from '../_lib/bust/head.ts';
import type { V } from '../_lib/bust/kit.ts';
import type { TorsoSpec } from '../_lib/bust/torso.ts';
import { HUMAN_PROPORTIONS, type ProportionTable } from '../_lib/face/proportions.ts';
import { ORC as ORC_RACE } from '../_lib/face/races.ts';
import { skullLandmarks, skullOf } from '../_lib/face/skull.ts';
import type { Character, FaceSpec } from '../_lib/face/spec.ts';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

/** Head height, menton → crown, metres. */
export const H = 0.3;

/** The orc's face on the CC0 base: vault ×0.74 high and ×0.84 deep (low, sloped, the face the
 *  mass), brow shelf 8 % H forward and 2.8 % H down over the eyes, eyes ×0.86 under lids open
 *  ×0.76, nose ×2.6 wide and ×0.62 projecting on a sunken bridge (broad, flat, porcine), zygoma
 *  ×1.18, jaw ×1.9 dropped 11 % H, chin ×1.75 wide and 7.5 % H forward, a muzzle 6 % H forward
 *  with a 5.5 % H underbite, mouth ×1.35, face ×1.1 long, ears ×1.4 pulled back and up to a point, neck ×1.7 and
 *  trapezius 18 % H higher, shoulders ×0.78 (the orc torso carries the bulk). */
export const ORC_FACE: FaceSpec = {
  ...ORC_RACE,
  cranium: { width: 1.02, height: 0.74, depth: 0.84 },
  brow: { forward: 0.08, height: -0.028 },
  eyes: { spacing: 1.0, tilt: -0.012, open: 0.76, size: 0.86 },
  nose: { width: 2.6, projection: 0.62, length: 0.86, bridge: -0.03, hook: 0 },
  zygoma: { width: 1.18, height: -0.006, forward: 0.022 },
  jaw: { width: 1.9, drop: 0.11 },
  chin: { forward: 0.075, width: 1.75 },
  mouth: { width: 1.35, lips: 0.02, underbite: 0.055 },
  face: 1.1,
  muzzle: 0.06,
  ears: { length: 1.4, tip: [0.14, 0.1, 0.2], out: 22 },
  body: { neck: 1.7, traps: 0.18, shoulders: 0.78 },
};

/** A scarred adult warrior: weathered, heavy, a little lopsided (seeded asymmetry). */
export const CHARACTER: Character = {
  race: ORC_FACE,
  age: 0.55,
  weight: 0.35,
  asym: 0.3,
  tone: { base: C.skin, flush: C.flush, lips: C.lips, cool: C.skinCool, cavity: C.cavity },
  eyes: { iris: C.iris },
  mouth: 0,
};

/** Frame: glabella placed so the menton lands on L.menton (0.285) and the crown at 0.585. */
export const SPEC: HeadSpec = {
  H,
  glabella: [0.152, 0, 0.497],
  r: { ...HUMAN, bigonial: HUMAN.bigonial * 1.5 },
  eyeR: 0.045,
  skin: C.skin,
  lips: C.lips,
};

/** The bust library's primitive landmarks (cut plane, boxes); the anatomy is the skull's (SK). */
export const BL = landmarks(SPEC);

/** The skull's own landmarks in the bust frame. */
export const SK = skullLandmarks(skullOf(CHARACTER, SPEC));

export const EYE: EyeSpec = {
  centre: SK.eye,
  r: SK.eyeR,
  // Human iris/ball ratio 5.85 / 12 kept: a small eye, not a cartoon one.
  iris: SK.eyeR * 0.49,
  upper: 0.34,
  lower: 0.16,
  lid: 0.0028,
  tilt: -4,
  scowl: 12,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

/** The skull stage brings its own ears; this spec only sizes the bust library's LOD boxes. */
export const EAR: EarSpec = {
  root: SK.tragion,
  along: [-0.2, 0.15, 1] as V,
  facing: [0.3, 1, 0.1] as V,
  length: Math.abs(SK.earTop[2] - SK.earLobe[2]),
  width: 0.55,
  thick: 0.007,
};

export const TORSO: TorsoSpec = { shoulders: 0.24, mass: 1, neck: L.neckR, cutZ: L.cutZ };

/** The orc's bands: the human's (../_lib/face/proportions.ts) with each declared delta. */
export const ORC_PROPORTIONS: ProportionTable = {
  ...HUMAN_PROPORTIONS,
  eyeLine: {
    lo: 0.5,
    hi: 0.62,
    source:
      'human 0.45–0.53; vault ×0.74 low over a jaw dropped 10 % H puts the eyes high in the head (declared)',
  },
  eyeFifth: {
    lo: 0.12,
    hi: 0.2,
    source: 'human 0.17–0.23 × eyes ×0.82 small and lids ×0.62 narrowed (declared)',
  },
  interocular: {
    lo: 0.9,
    hi: 1.7,
    source: 'human 0.85–1.3; small fissures either side of a ×2 broad nose bridge (declared)',
  },
  noseThird: {
    lo: 0.6,
    hi: 1.0,
    source: 'human 0.75–1.15; nose ×0.88 short over a jaw dropped 8 % H (declared)',
  },
  neckWidth: {
    lo: 2.6,
    hi: 3.8,
    source:
      'human 0.66–0.86; the orc trapezius rises to the ears (traps +18 % H, neck ×1.7), so a third of the way from the jaw angle to the sternal notch the section runs through the trap shelf, not a neck column (declared)',
  },
  eyeDepth: {
    lo: 0.014,
    hi: 0.05,
    source:
      'human 8–24 mm + the brow shelf pushed 8 % H (≈ 2.4 cm on the 0.30 m head) forward over deep-set eyes (declared)',
  },
  eyeball: {
    lo: 0.022,
    hi: 0.03,
    source: 'human 22–26 mm × 0.82 on a ×1.3 head: a human-sized ball in a big skull (declared)',
  },
};
