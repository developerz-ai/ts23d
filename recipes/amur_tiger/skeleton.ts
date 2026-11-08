// The tiger's skeleton: every landmark the body-part modules share, in metres, +X front, Z up,
// LEFT side (+Y; the right side mirrors). An adult male Amur tiger standing relaxed (README.md):
// shoulder height 1.0 m, head + body 1.95 m nose → tail root, tail 0.99 m. The head is authored
// level in its own frame (origin at the atlas, +X along the skull) and pitched down into place, so
// the face can be sculpted on clean planes; `headToWorld` carries any head point into the asset.

import type { Vec3 } from '@developerz.ai/ts23d';

const deg = Math.PI / 180;

/** Head carriage: the skull pitched nose-down (relaxed, head low; Schönbrunn side photos). */
export const HEAD_PITCH = 17 * deg;
/** Atlas joint (head pivot) in the world: where the neck enters the back of the skull. */
export const HEAD_PIVOT: Vec3 = [0.775, 0, 0.73];

/** The head frame is authored at skull scale; the Amur's winter fur (ruff, nape, crown: Geptner &
 *  Sludskij 70–110 mm) makes the furred head bigger than the skull: scale it into the world. */
export const HEAD_SCALE = 1.08;

/** Head-local point → world (scale, pitch about Y, then move to the pivot). */
export function headToWorld(p: Vec3): Vec3 {
  const c = Math.cos(HEAD_PITCH) * HEAD_SCALE;
  const s = Math.sin(HEAD_PITCH) * HEAD_SCALE;
  return [
    HEAD_PIVOT[0] + c * p[0] + s * p[2],
    HEAD_PIVOT[1] + p[1] * HEAD_SCALE,
    HEAD_PIVOT[2] - s * p[0] + c * p[2],
  ];
}

/** Head-local direction → world. */
export function headDirToWorld(d: Vec3): Vec3 {
  const c = Math.cos(HEAD_PITCH);
  const s = Math.sin(HEAD_PITCH);
  return [c * d[0] + s * d[2], d[1], -s * d[0] + c * d[2]];
}

/** Landmarks of the head in its own frame (level skull, origin at the atlas). */
export const HEAD = {
  /** Braincase centre (temporal muscle included). */
  cranium: [0.085, 0, 0.075] as Vec3,
  /** Eyeball centre, left. Round, forward-set (binocular), under the brow. */
  eye: [0.232, 0.056, 0.062] as Vec3,
  eyeR: 0.0165,
  /** Tip of the nose leather. */
  nose: [0.328, 0, 0.012] as Vec3,
  /** Jaw hinge (temporomandibular joint), centre line. */
  hinge: [0.075, 0, -0.045] as Vec3,
  /** Mouth line height at the lip (the upper jaw is cut here). */
  mouthZ: -0.072,
  /** Rest opening of the mouth, degrees (relaxed: canines just show). */
  open: 2.5,
  /** Ear base centre, left. */
  ear: [0.052, 0.082, 0.138] as Vec3,
} as const;

/** World landmarks of the trunk, legs and tail (left side). */
export const SK = {
  /** Torso masses: ellipsoid centre + radii (ribcage, loin, pelvis). */
  chest: { at: [0.4, 0, 0.7] as Vec3, r: [0.3, 0.148, 0.25] as Vec3 },
  ribs: { at: [0.06, 0, 0.71] as Vec3, r: [0.34, 0.15, 0.225] as Vec3 },
  loin: { at: [-0.34, 0, 0.73] as Vec3, r: [0.27, 0.13, 0.178] as Vec3 },
  pelvis: { at: [-0.62, 0, 0.75] as Vec3, r: [0.25, 0.14, 0.17] as Vec3 },
  /** Dorsal line (top of the back) withers → tail root. */
  spine: [
    [0.44, 0, 0.985],
    [0.2, 0, 0.955],
    [-0.05, 0, 0.935],
    [-0.35, 0, 0.93],
    [-0.6, 0, 0.94],
    [-0.8, 0, 0.88],
  ] as Vec3[],
  /** Where the tail leaves the croup. */
  tailRoot: [-0.83, 0, 0.83] as Vec3,
  /** Neck centre line chest → atlas, with radii. */
  neck: [
    [0.5, 0, 0.8],
    [0.64, 0, 0.78],
    [0.76, 0, 0.75],
  ] as Vec3[],
  neckR: [0.16, 0.138, 0.118],
  fore: {
    scapula: [0.42, 0.12, 0.93] as Vec3,
    shoulder: [0.57, 0.128, 0.65] as Vec3,
    elbow: [0.4, 0.138, 0.44] as Vec3,
    wrist: [0.475, 0.122, 0.135] as Vec3,
    paw: [0.545, 0.118, 0.045] as Vec3,
  },
  hind: {
    hip: [-0.63, 0.115, 0.72] as Vec3,
    knee: [-0.47, 0.148, 0.5] as Vec3,
    hock: [-0.735, 0.118, 0.25] as Vec3,
    paw: [-0.665, 0.113, 0.045] as Vec3,
  },
  /** Tail centre line root → tip: hangs in a J, the tip turned up just above the ground. */
  tail: [
    [-0.83, 0, 0.83],
    [-0.93, 0, 0.75],
    [-1.0, 0.005, 0.6],
    [-1.035, 0.015, 0.42],
    [-1.04, 0.025, 0.25],
    [-1.015, 0.035, 0.12],
    [-0.955, 0.04, 0.065],
    [-0.868, 0.04, 0.082],
  ] as Vec3[],
  /** Tail radius (fur included) root → tip. */
  tailR: [0.055, 0.047, 0.042, 0.04, 0.039, 0.038, 0.036, 0.03],
} as const;

/** Real numbers the recipe is held to (README.md table). */
export const REAL = {
  headBody: 1.95,
  tail: 0.99,
  shoulder: 1.0,
  mass: 243,
  skull: 0.36,
  padWidth: 0.115,
} as const;
