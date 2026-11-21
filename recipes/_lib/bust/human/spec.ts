// Human hero bust spec: the proportions are the MEASURED human anchor (Lee Perry-Smith scan
// ratios, docs/research/head-analysis.md) pushed slightly heroic — jaw ×1.06, chin ×1.1, neck
// thick — plus palette, eye, ear and torso specs. One table every module reads.

import { hex } from '@developerz.ai/ts23d';
import { skullLandmarks, skullOf } from '../../face/skull.ts';
import { type Character, HUMAN as HUMAN_FACE } from '../../face/spec.ts';
import type { EarSpec } from '../ear.ts';
import type { EyeSpec } from '../eye.ts';
import type { Structure } from '../face-forms.ts';
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

/** The hero's face against the CC0 base (gender-neutral MakeHuman default) — every delta is a
 *  sourced male norm or a declared heroic push (README "Proportions"): head breadth ×1.05 (base
 *  147 mm → 154, ANSUR II male mean 157), bigonial ×1.16 (87 → 101 mm, Farkas male go-go ≈ 100),
 *  chin forward 0.6 % H and ×1.15 wide (male chin), brow ridge 0.5 % H forward (male glabella),
 *  eye spacing ×1.12 (IPD 56 → 63 mm, Dodgson 2004 adult mean 63.4 mm), nose ×1.12 projection and a 0.3 % H higher bridge, neck ×1.3 (base side-to-side 80 mm → 104,
 *  ANSUR II male neck circumference 395 mm ≈ 120 × 100 mm section with the SCMs), face ×1.03 long. */
export const HERO_FACE = {
  ...HUMAN_FACE,
  cranium: { width: 1.05, height: 1, depth: 1.02 },
  brow: { forward: 0.005, height: 0 },
  eyes: { spacing: 1.12, tilt: 0, open: 1, size: 1.1 },
  nose: { width: 1.05, projection: 1.12, length: 1.02, bridge: 0.003, hook: 0 },
  zygoma: { width: 1.03, height: 0.004, forward: 0.003 },
  jaw: { width: 1.16, drop: 0.07 },
  chin: { forward: 0.006, width: 1.15 },
  mouth: { width: 1.02, lips: 0, underbite: 0 },
  face: 1.03,
  body: { neck: 1.3, traps: 0.02, shoulders: 1.1 },
} as const;

/** The skull stage's character: the hero face, a young adult, lean, symmetric. */
export const CHARACTER: Character = {
  race: HERO_FACE,
  age: 0.3,
  weight: -0.15,
  asym: 0,
  tone: { base: C.skin, flush: C.warm, lips: C.lips, cool: C.cool, cavity: C.cavity },
  eyes: { iris: C.iris },
  mouth: 0,
};

/** The skull's own landmarks in the bust frame (eyes sit in its orbits). */
export const SK = skullLandmarks(skullOf(CHARACTER, SPEC));

export const EYE: EyeSpec = {
  centre: SK.eye,
  r: SK.eyeR,
  // Human iris 11.7 mm on a 24 mm ball. The upper lid covers its top 1.9 mm, the lower lid
  // touches its bottom (a 9.6 mm fissure, Farkas: 9–11 mm); at 25 % / 12 % the eyes read small
  // and sleepy (D570). Lid margin 2.6 mm thick: what the face's finest cell (1.65 mm) holds.
  iris: 0.00585,
  upper: 0.16,
  lower: 0.02,
  lid: 0.0026,
  tilt: 2,
  colours: { sclera: C.sclera, iris: C.iris, pupil: C.pupil, wet: C.wet, caruncle: C.caruncle },
};

/** The hero's bones over the soft base (../face-forms.ts): a man's brow shelf, an orbit with a
 *  firm edge, the lateral rim 11 mm behind the cornea, cheekbones over a lean buccal plane. */
export const STRUCTURE: Structure = {
  brow: 0.01,
  orbit: 0.4,
  depth: 1,
  rim: 0.036,
  cheek: 0.008,
  hollow: 0.004,
  lash: hex('#2a1810'),
  lid: hex('#c88e6a'),
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
