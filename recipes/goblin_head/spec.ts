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

export const H = 0.19;
export const CUT_Z = 0.08;

export const C = {
  skin: hex('#9cb84a'),
  warm: hex('#b8c860'),
  cool: hex('#6a8a4a'),
  cavity: hex('#3a4a1a'),
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

export const EYE: EyeSpec = {
  centre: L.eye,
  r: L.eyeR,
  iris: L.eyeR * 0.55,
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
