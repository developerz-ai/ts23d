// Elf bust spec: the measured human anchor (docs/research/head-analysis.md) with the elf's declared
// exaggerations — slender: cranium width ×0.94, jaw (bigonial) ×0.85, chin pointed and forward;
// high cheekbones ×1.35; refined narrow nose ×0.8; eyes a touch larger, wider set and almond
// (lid line tilted +10°); ears with the human ear's structure, the helix drawn out to a point
// swept back and up to between the brow and the crown, grafted as a leaf of real cartilage.

import { hex } from '@developerz.ai/ts23d';
import type { EarSpec } from '../_lib/bust/ear.ts';
import { type EarGraft, tipPull } from '../_lib/bust/ear-graft.ts';
import type { EyeSpec } from '../_lib/bust/eye.ts';
import type { Structure } from '../_lib/bust/face-forms.ts';
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
  cool: hex('#c4a296'),
  cavity: hex('#7a4a44'),
  lips: hex('#c47a76'),
  sclera: hex('#f0ece6'),
  iris: hex('#3a8a6a'),
  pupil: hex('#06100c'),
  wet: hex('#f6cfc4'),
  caruncle: hex('#d88a84'),
  // Golden: a deep honey root to a saturated pale-gold tip (#9a7038 → #f0d890, a greyed khaki
  // range, read as straw in the hero, D525).
  hairRoot: hex('#8a5620'),
  hairTip: hex('#f6d27e'),
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

const EAR_OUT = 20;

/** The base's ear before any elf reshaping (the ear deformer moves no landmark). */
const EAR0 = skullLandmarks(
  skullOf(
    {
      race: ELF_RACE,
      age: 0,
      weight: 0,
      asym: 0,
      tone: { base: C.skin, flush: C.warm, lips: C.lips, cool: C.cool, cavity: C.cavity },
      eyes: { iris: C.iris },
    },
    { H, glabella: [0, 0, 0] },
  ),
);

/** The elf's face on the CC0 base (the race preset, ../_lib/face/races.ts, pushed): the ears'
 *  tips drawn 0.3 H back and up in the ear's own plane, the ear held 20° out (`tipPull`), eyes
 *  ×1.06 and set ×1.166 wide (IPD 64 mm, human 0.265 H × 1.05), almond (tilt +2 % H), cheekbones high (+2 % H), slender neck ×0.85. */
export const ELF_FACE: FaceSpec = {
  ...ELF_RACE,
  eyes: { spacing: 1.166, tilt: 0.02, open: 0.95, size: 1.15 },
  // The mid-face 3 % shorter than the race preset's (it read long and older than intended).
  face: ELF_RACE.face * 0.97,
  jaw: { width: 0.85, drop: 0.05 },
  zygoma: { width: 1.04, height: 0.02, forward: 0.008 },
  // (Length ×1: a stretched base ear leaves the bust's fine ear box, and its rim turns ragged.)
  // The tip drawn 0.3 H up and back in the ear's own plane, raked 44° from its axis: it ends a
  // fifth of the head over the eye line, between the brow and the crown (at +0.37 H it stood
  // beside the crown, inside the hair, D573), the ear held 20° out so it clears the hair.
  ears: { length: 1, tip: tipPull(EAR0, EAR_OUT, 44, 0.3), out: EAR_OUT },
  // (Shoulders ×0.78: the base mesh brings its own shoulder tops above the torso's.)
  body: { neck: 0.85, traps: -0.01, shoulders: 0.78 },
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
  // A thin upper lid, its crease high: a young eye.
  upper: 0.2,
  lower: 0.06,
  // (2.4 mm: a margin the face's finest cell holds, D571.)
  lid: 0.0024,
  tilt: 10,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

/** The elf's bones over the soft base (../_lib/bust/face-forms.ts): a light brow over a soft
 *  orbit, high cheekbones, a smooth cheek under them. */
export const STRUCTURE: Structure = {
  brow: 0.005,
  orbit: 0.45,
  depth: 0.6,
  rim: 0.024,
  cheek: 0.008,
  hollow: 0,
  lash: hex('#5a4030'),
  lid: hex('#e2bc9e'),
};

/** The leaf blade over the base's stretched ear (../_lib/bust/ear-graft.ts): 36 mm wide near
 *  its base, cartilage 4.2 mm thick under a rolled helix (D573). */
export const GRAFT: EarGraft = {
  out: EAR_OUT,
  width: 0.036,
  belly: 0.2,
  thick: 0.0042,
  lead: 0.02,
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

// Slender sloping shoulders (0.15 m half-span, mass 0.12): at 0.175 / 0.3 the cloaked deltoids read
// as two balloons 2.1 head widths apart.
export const TORSO: TorsoSpec = {
  shoulders: 0.15,
  mass: 0.12,
  neck: 0.05,
  larynx: 0.3,
  cutZ: CUT_Z,
  // Sawn through the shoulder point itself: a slender bust, no deltoid left to swell the cloak.
  armCut: 0,
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
