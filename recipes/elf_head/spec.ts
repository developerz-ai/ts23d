// Elf bust spec: the measured human anchor (docs/research/head-analysis.md) with the elf's declared
// exaggerations — slender: cranium width ×0.94, jaw (bigonial) ×0.85, chin pointed and forward;
// high cheekbones ×1.35; refined narrow nose ×0.8; eyes a touch larger, wider set and almond
// (lid line tilted +10°); ears with the human ear's structure and the helix drawn out to a long
// point swept back and up (total length ×2.3 the human ear).

import { hex } from '@developerz.ai/ts23d';
import type { EarSpec } from '../_lib/bust/ear.ts';
import type { EyeSpec } from '../_lib/bust/eye.ts';
import { type HeadSpec, HUMAN, landmarks } from '../_lib/bust/head.ts';
import type { V } from '../_lib/bust/kit.ts';
import type { NeckRange, TorsoSpec } from '../_lib/bust/torso.ts';

export const H = 0.23;
export const CUT_Z = 0.1;

export const C = {
  skin: hex('#e8c4a4'),
  warm: hex('#f2d0ae'),
  cool: hex('#b8a0a4'),
  cavity: hex('#7a4a44'),
  lips: hex('#c47a76'),
  sclera: hex('#f0ece6'),
  iris: hex('#3a8a6a'),
  pupil: hex('#06100c'),
  wet: hex('#f6cfc4'),
  caruncle: hex('#d88a84'),
  hairRoot: hex('#9a7038'),
  hairTip: hex('#f0d890'),
  tunic: hex('#2f5a3a'),
  tunicDark: hex('#1a3420'),
  cloak: hex('#2a4a5a'),
  cloakDark: hex('#16303c'),
  trim: hex('#c8a858'),
  silver: hex('#d8dce0'),
  plinth: hex('#3a3634'),
};

const R = {
  ...HUMAN,
  craniumWidth: HUMAN.craniumWidth * 0.94,
  bigonial: HUMAN.bigonial * 0.85,
  chinProj: 0.03,
  ipd: HUMAN.ipd * 1.05,
  eye: HUMAN.eye + 0.01,
  noseProj: HUMAN.noseProj * 0.95,
};

export const SPEC: HeadSpec = {
  H,
  glabella: [(R.depth - 0.45) * H, 0, CUT_Z + 0.75 * H + 0.04 + R.brow * H],
  r: R,
  // Jaw ×1 here: the narrow jaw is already declared in the bigonial ratio (×0.85) — a second
  // ×0.85 knob made the face a gaunt V. Cheekbones high (lifted 2 % H) and smooth; full cheeks;
  // refined lips set 1.2 % H back (a straight, not protruding, profile); orbits that roll softly
  // into the brow (×1.4 blend); no expression lines (youthful).
  knobs: {
    cheekbone: 1.15,
    cheekLift: 0.02,
    jaw: 1,
    chin: 0.8,
    brow: 0.6,
    noseWidth: 0.8,
    lips: 0.6,
    prognathism: -0.012,
    socket: 1.4,
    lines: 0,
    mouth: 0.1,
    hollow: 0,
  },
  eyeR: 0.056,
  skin: C.skin,
  lips: C.lips,
};

export const L = landmarks(SPEC);

export const EYE: EyeSpec = {
  centre: L.eye,
  r: L.eyeR,
  iris: L.eyeR * 0.52,
  upper: 0.24,
  lower: 0.1,
  lid: 0.0021,
  tilt: 10,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

export const EAR: EarSpec = {
  root: L.ear,
  along: [-0.55, 0.42, 0.72] as V,
  facing: [0.35, 1, 0.15] as V,
  length: L.earLength,
  width: 0.5,
  tip: 1.3,
  sweep: 0.35,
  thick: 0.0058,
  lobe: 0.6,
};

export const TORSO: TorsoSpec = {
  shoulders: 0.175,
  mass: 0.3,
  neck: 0.05,
  larynx: 0.3,
  cutZ: CUT_Z,
};

/** Declared neck stylisation (slender: neck 0.6–0.7 × head width (human 0.7–0.8)). */
export const NECK: NeckRange = { width: [0.6, 0.7], length: [0.25, 0.35] };
