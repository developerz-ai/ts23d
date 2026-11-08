// Cinderhorn's skeleton: every landmark the body-part modules share (joints, masses, the wing
// fan, the tail line), in metres, +X front, Z up, LEFT side (+Y); the right side mirrors. One
// place to change a proportion; every module reads it, so parts always meet.

import type { Vec3 } from '@developerz.ai/ts23d';
import { rotate, v3 } from '../_lib/creature/curve.ts';

/** Degrees the outer wing is swept back about the root (opens the membrane to 3/4 views). */
export const WING_SWEEP = 28;

/** The left wing laid out spread, then swept back about a vertical axis through its root. */
function wing() {
  const root: Vec3 = [0.4, 0.36, 2.16];
  const sweep = (p: Vec3): Vec3 =>
    v3.add(root, rotate(v3.sub(p, root), [0, 0, 1], (WING_SWEEP * Math.PI) / 180));
  return {
    root,
    elbow: sweep([0.18, 1.3, 2.95]),
    wrist: sweep([0.5, 2.35, 3.9]),
    thumb: sweep([0.82, 2.5, 4.12]),
    /** Finger tips, leading → trailing. */
    tips: [
      sweep([0.25, 4.25, 4.62]),
      sweep([-0.75, 4.4, 3.62]),
      sweep([-1.3, 3.75, 2.72]),
      sweep([-1.45, 2.55, 2.28]),
    ],
    /** Where the membrane meets the flank, shoulder → front of the hips (not swept). */
    flank: [
      [0.4, 0.46, 2.12],
      [-0.1, 0.5, 2.0],
      [-0.65, 0.46, 1.98],
    ] as Vec3[],
  };
}

export const SK = {
  /** Torso masses: ellipsoid centre + radii. */
  chest: { at: [0.7, 0, 1.6] as Vec3, r: [0.86, 0.6, 0.66] as Vec3 },
  ribs: { at: [-0.12, 0, 1.56] as Vec3, r: [0.86, 0.52, 0.52] as Vec3 },
  waist: { at: [-0.78, 0, 1.64] as Vec3, r: [0.5, 0.37, 0.38] as Vec3 },
  hips: { at: [-1.22, 0, 1.64] as Vec3, r: [0.58, 0.5, 0.5] as Vec3 },
  /** Spine line (top of the back) nose → hips, for the dorsal ridge. */
  spine: [
    [1.95, 0, 3.12],
    [1.75, 0, 2.8],
    [1.5, 0, 2.48],
    [1.1, 0, 2.3],
    [0.55, 0, 2.28],
    [0.0, 0, 2.08],
    [-0.6, 0, 2.03],
    [-1.2, 0, 2.15],
    [-1.75, 0, 2.02],
  ] as Vec3[],
  /** Neck centre line chest → head joint, radii per node. */
  neck: [
    [1.05, 0, 1.85],
    [1.45, 0, 2.15],
    [1.72, 0, 2.6],
    [1.92, 0, 2.95],
    [2.2, 0, 3.18],
  ] as Vec3[],
  neckR: [0.55, 0.42, 0.33, 0.29, 0.27],
  /** Head: joint at the neck end; jaw hinge; eye; nose tip. */
  head: {
    joint: [2.2, 0, 3.18] as Vec3,
    cranium: [2.42, 0, 3.36] as Vec3,
    hinge: [2.36, 0, 3.12] as Vec3,
    eye: [2.74, 0.205, 3.47] as Vec3,
    nose: [3.66, 0, 3.28] as Vec3,
    /** Rest opening of the jaw, degrees. */
    open: 16,
  },
  fore: {
    shoulder: [0.92, 0.6, 1.5] as Vec3,
    elbow: [0.5, 0.8, 0.98] as Vec3,
    wrist: [0.98, 0.82, 0.32] as Vec3,
    palm: [1.12, 0.84, 0.13] as Vec3,
  },
  hind: {
    hip: [-1.22, 0.56, 1.5] as Vec3,
    knee: [-0.7, 0.74, 0.98] as Vec3,
    hock: [-1.5, 0.76, 0.52] as Vec3,
    ball: [-1.12, 0.78, 0.13] as Vec3,
  },
  /** Left wing (see `wing()` below): root on the back, elbow, wrist, finger tips, flank line. */
  wing: wing(),
  /** Tail centre line root → tip (curls to the left), radii per node. */
  tail: [
    [-1.6, 0, 1.64],
    [-2.15, 0, 1.38],
    [-2.65, 0.06, 0.92],
    [-3.1, 0.26, 0.46],
    [-3.55, 0.5, 0.2],
    [-4.0, 0.48, 0.13],
    [-4.42, 0.2, 0.1],
    [-4.75, -0.2, 0.075],
  ] as Vec3[],
  /** Tail radii per node: the last spans rest on the ground (centre height = radius). */
  tailR: [0.44, 0.36, 0.28, 0.22, 0.17, 0.13, 0.1, 0.075],
} as const;

/** Pivot where the tail part hangs from the body (inside the stump). */
export const TAIL_PIVOT: Vec3 = [-2.15, 0, 1.38];
