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
import { HUMAN_PROPORTIONS, type ProportionTable } from '../_lib/face/proportions.ts';
import { ELF as ELF_RACE } from '../_lib/face/races.ts';
import { skullLandmarks, skullOf } from '../_lib/face/skull.ts';
import type { Character, FaceSpec } from '../_lib/face/spec.ts';

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

/** The elf's face on the CC0 base (the race preset, ../_lib/face/races.ts, pushed): ears ×1.7
 *  long with the helix drawn back and up to a point (the elf_head design's long swept ear), eyes
 *  ×1.06 and set ×1.166 wide (IPD 64 mm, human 0.265 H × 1.05), almond (tilt +2 % H), cheekbones high (+2 % H), slender neck ×0.85. */
export const ELF_FACE: FaceSpec = {
  ...ELF_RACE,
  eyes: { spacing: 1.166, tilt: 0.02, open: 0.95, size: 1.15 },
  jaw: { width: 0.85, drop: 0.05 },
  zygoma: { width: 1.04, height: 0.02, forward: 0.008 },
  ears: { length: 1.7, tip: [0.2, 0.05, 0.26], out: 8 },
  body: { neck: 0.85, traps: -0.01, shoulders: 0.95 },
};

/** The skull stage's character: a young adult elf, lean, symmetric. */
export const CHARACTER: Character = {
  race: ELF_FACE,
  age: 0.05,
  weight: -0.3,
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
  iris: SK.eyeR * 0.52,
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

/** The elf's proportion bands: the human's (../_lib/face/proportions.ts) with the declared deltas —
 *  eyes ×1.15 (a wider fissure and ball), a long refined lower face, a slender neck. */
export const ELF_PROPORTIONS: ProportionTable = {
  ...HUMAN_PROPORTIONS,
  eyeFifth: {
    lo: 0.19,
    hi: 0.27,
    source: 'human 0.17–0.23 × the elf eye ×1.15 (declared, ELF_FACE)',
  },
  noseThird: {
    lo: 0.8,
    hi: 1.25,
    source: 'human 0.75–1.15; the elf jaw drops 5 % H less than the hero (declared)',
  },
  neckWidth: {
    lo: 0.5,
    hi: 0.75,
    source: 'human 0.66–0.86 × the slender elf neck ×0.85 (declared)',
  },
  eyeball: { lo: 0.022, hi: 0.028, source: 'human 22–26 mm × 1.15 (declared)' },
};
