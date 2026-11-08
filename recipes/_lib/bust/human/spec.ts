// Human hero bust spec: the proportions are the MEASURED human anchor (Lee Perry-Smith scan
// ratios, docs/research/head-analysis.md) pushed slightly heroic — jaw ×1.06, chin ×1.1, neck
// thick — plus palette, eye, ear and torso specs. One table every module reads.

import { hex } from '@developerz.ai/ts23d';
import type { EarSpec } from '../ear.ts';
import type { EyeSpec } from '../eye.ts';
import { type HeadSpec, HUMAN, landmarks } from '../head.ts';
import type { V } from '../kit.ts';
import type { TorsoSpec } from '../torso.ts';

export const H = 0.23;
export const CUT_Z = 0.1;

export const C = {
  skin: hex('#d4986f'),
  warm: hex('#e0aa80'),
  cool: hex('#a87868'),
  cavity: hex('#6a3428'),
  lips: hex('#b86b5c'),
  sclera: hex('#ece6dc'),
  iris: hex('#3d6e9e'),
  pupil: hex('#0a0a0c'),
  wet: hex('#f0c0b0'),
  caruncle: hex('#d07a74'),
  hairRoot: hex('#3a2416'),
  hairTip: hex('#8a6038'),
  tunic: hex('#2e4f8a'),
  tunicDark: hex('#1e3560'),
  mantle: hex('#7a2420'),
  mantleDark: hex('#4a1412'),
  leather: hex('#6b4428'),
  brass: hex('#c9a24a'),
  plinth: hex('#3a3634'),
};

/** Glabella placed so the torso centre sits on x = 0 and the bust base on the plinth. */
export const SPEC: HeadSpec = {
  H,
  glabella: [(HUMAN.depth - 0.45) * H, 0, CUT_Z + 0.75 * H + 0.05 + HUMAN.brow * H],
  r: HUMAN,
  // Heroic: square jaw ×1.06, chin ×1.1; brow ×0.9 (a ridge, not a ledge over the eyes).
  // Everything else is the measured human.
  knobs: { jaw: 1.06, chin: 1.1, brow: 0.9 },
  eyeR: 0.052,
  skin: C.skin,
  lips: C.lips,
};

export const L = landmarks(SPEC);

export const EYE: EyeSpec = {
  centre: L.eye,
  r: L.eyeR,
  // Human iris 11.7 mm on a 24 mm ball.
  iris: 0.00585,
  upper: 0.25,
  lower: 0.12,
  lid: 0.0022,
  tilt: 2,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

export const EAR: EarSpec = {
  root: L.ear,
  along: [-0.18, 0.12, 1] as V,
  facing: [0.3, 1, 0.05] as V,
  length: L.earLength,
  width: 0.55,
  thick: 0.0062,
};

export const TORSO: TorsoSpec = {
  shoulders: 0.2,
  mass: 0.55,
  neck: 0.062,
  larynx: 1,
  cutZ: CUT_Z,
};
