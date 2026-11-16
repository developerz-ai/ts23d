// Goblin bust spec: the measured human anchor (docs/research/head-analysis.md) with the goblin's
// declared exaggerations — head 0.19 m (0.83 × human) with a bigger vault (cranium width ×1.14,
// height ×1.12); eyes ×1.45 the human ball, wider set (IPD ×1.25), heavy drooping lids; a long
// hooked nose (projection ×2.8, hooked 3.5 % H); a wide grin (mouth half-width 0.17 H vs 0.10);
// a small sharp chin (×0.7) and narrow jaw (×0.8); huge leaf ears built on human ear anatomy,
// 2.1 × the human ear's length, held out sideways, notched. Bony torso, thin neck.

import { hex } from '@developerz.ai/ts23d';
import type { EarSpec } from '../_lib/bust/ear.ts';
import type { EyeSpec } from '../_lib/bust/eye.ts';
import { type HeadSpec, HUMAN, landmarks } from '../_lib/bust/head.ts';
import type { V } from '../_lib/bust/kit.ts';
import type { NeckRange, TorsoSpec } from '../_lib/bust/torso.ts';
import { HUMAN_PROPORTIONS, type ProportionTable } from '../_lib/face/proportions.ts';
import { GOBLIN as GOBLIN_RACE } from '../_lib/face/races.ts';
import { skullLandmarks, skullOf } from '../_lib/face/skull.ts';
import type { Character, FaceSpec } from '../_lib/face/spec.ts';

export const H = 0.19;
export const CUT_Z = 0.08;

export const C = {
  // Muted olive-yellow (a bright lime read as a plastic toy).
  skin: hex('#8c9c4c'),
  warm: hex('#aaa85c'),
  cool: hex('#5c7048'),
  cavity: hex('#2e3818'),
  lips: hex('#7a7a36'),
  flush: hex('#b08a4a'),
  wart: hex('#7a8a3a'),
  sclera: hex('#f0e6a0'),
  iris: hex('#e0a020'),
  pupil: hex('#140a02'),
  wet: hex('#d8d890'),
  caruncle: hex('#c0805a'),
  teeth: hex('#e8dcae'),
  mouth: hex('#3a1010'),
  hairRoot: hex('#b0a890'),
  hairTip: hex('#f0ece0'),
  shirt: hex('#d8ccaa'),
  shirtDark: hex('#a89c7a'),
  vest: hex('#6a4428'),
  vestDark: hex('#3e2614'),
  scarf: hex('#9a3020'),
  hood: hex('#4a5a34'),
  brass: hex('#c9a24a'),
  plinth: hex('#3a3634'),
};

const R = {
  ...HUMAN,
  craniumWidth: HUMAN.craniumWidth * 1.14,
  depth: 0.95,
  ipd: HUMAN.ipd * 1.25,
  eye: 0.53,
  noseProj: HUMAN.noseProj * 2.8,
  noseTip: 0.35,
  subnasale: 0.3,
  mouth: 0.21,
  bigonial: HUMAN.bigonial * 0.8,
  pogonion: 0.1,
  chinProj: -0.02,
};

export const SPEC: HeadSpec = {
  H,
  glabella: [(R.depth - 0.45) * H, 0, CUT_Z + 0.75 * H + 0.03 + R.brow * H],
  r: R,
  knobs: {
    cheekbone: 1.1,
    jaw: 0.8,
    chin: 0.7,
    brow: 0.9,
    noseWidth: 0.85,
    noseHook: 0.035,
    lips: 0.8,
    lines: 0.7,
    mouth: 0.17,
    vault: 1.12,
  },
  eyeR: 0.075,
  skin: C.skin,
  lips: C.lips,
};

export const L = landmarks(SPEC);

/** The goblin's face on the CC0 base (race preset ../_lib/face/races.ts, pushed to the design):
 *  eyes ×1.45 (orbit, lids and ball), set
 *  ×1.28 wide (IPD 63 mm, human 0.265 H × 1.25), heavy lids; nose projection ×2.8 hooked 5 % H; mouth ×1.4 wide; chin receding,
 *  ×0.7; ears ×2.6 long, held out 60°; vault ×1.12; thin neck ×0.8. */
export const GOBLIN_FACE: FaceSpec = {
  ...GOBLIN_RACE,
  cranium: { width: 1.14, height: 1.12, depth: 1.08 },
  eyes: { spacing: 1.28, tilt: 0.006, open: 0.95, size: 1.45 },
  nose: { width: 1.1, projection: 2.8, length: 1.3, bridge: 0.02, hook: 0.05 },
  mouth: { width: 1.4, lips: -0.002, underbite: 0 },
  ears: { length: 2.6, tip: [0.04, 0.5, 0.1], out: 60 },
  body: { neck: 0.8, traps: -0.02, shoulders: 0.9 },
};

/** The skull stage's character: a wiry adult goblin, lean, symmetric (warts bring the asymmetry). */
export const CHARACTER: Character = {
  race: GOBLIN_FACE,
  age: 0.5,
  weight: -0.4,
  asym: 0,
  tone: { base: C.skin, flush: C.warm, lips: C.lips, cool: C.cool, cavity: C.cavity },
  eyes: { iris: C.iris },
  mouth: 0,
};

/** The skull's own landmarks in the bust frame. */
export const SK = skullLandmarks(skullOf(CHARACTER, SPEC));

export const EYE: EyeSpec = {
  centre: SK.eye,
  r: SK.eyeR,
  iris: SK.eyeR * 0.55,
  upper: 0.36,
  lower: 0.14,
  lid: 0.0024,
  tilt: -7,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

export const EAR: EarSpec = {
  root: [L.ear[0] + 0.012, L.ear[1] - 0.004, L.ear[2] + 0.012] as V,
  along: [-0.15, 1, 0.1] as V,
  facing: [0.55, 0.15, 0.85] as V,
  length: L.earLength * 2.1,
  rootLength: L.earLength,
  width: 0.6,
  tip: 0.7,
  sweep: 0.2,
  thick: 0.0075,
  // A leaf ear's lobe stays small: ×0.7 on a 2.1× ear hung a 2 cm ball below each ear.
  lobe: 0.25,
  notches: [
    { t: 0.5, depth: 0.14 },
    { t: 0.66, depth: 0.09 },
  ],
};

export const TORSO: TorsoSpec = {
  shoulders: 0.12,
  mass: 0.15,
  neck: 0.039,
  larynx: 0.7,
  cutZ: CUT_Z,
};

/** Declared neck stylisation (stylised skinny: neck 0.45–0.6 × head width, ≤ 0.35 H above the scarf — still muscle and windpipe). */
export const NECK: NeckRange = { width: [0.45, 0.6], length: [0.2, 0.35] };

/** The goblin's proportion bands: the human's (../_lib/face/proportions.ts) with the declared
 *  deltas — a big vault drops the eye line, big eyes set close for their size, a long hooked nose
 *  over a receding chin, a thin neck. */
export const GOBLIN_PROPORTIONS: ProportionTable = {
  ...HUMAN_PROPORTIONS,
  eyeLine: { lo: 0.4, hi: 0.5, source: 'human 0.45–0.53 under a vault ×1.12 high (declared)' },
  eyeFifth: { lo: 0.2, hi: 0.32, source: 'human 0.17–0.23 × the goblin eye ×1.45 (declared)' },
  interocular: {
    lo: 0.7,
    hi: 1.3,
    source: 'human 0.85–1.3; the big fissures crowd the bridge (declared)',
  },
  noseThird: {
    lo: 1.8,
    hi: 3.2,
    source: 'human 0.75–1.15; nose ×1.3 long over a receding chin ×0.7 (declared)',
  },
  neckWidth: {
    lo: 0.35,
    hi: 0.6,
    source: 'human 0.66–0.86 × the thin goblin neck ×0.8 under a ×1.14 head (declared)',
  },
  eyeDepth: {
    lo: 0.006,
    hi: 0.024,
    source: 'human 8–24 mm; the big ball fills the orbit forward (declared)',
  },
  eyeball: { lo: 0.024, hi: 0.034, source: 'human 22–26 mm × 1.45 on a 0.83 × head (declared)' },
};
