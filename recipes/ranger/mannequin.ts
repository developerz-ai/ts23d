// The CPU tier: a neutral grey mannequin in the ranger's a-pose and at its real size, built when
// the neural cache misses (no `recipes/ranger/neural/`, or a request changed and was not re-run).
// One closed SDF surface of capsules on the landmark heights of README.md "Proportions": no face,
// no costume, no skin, no clips. It keeps the asset buildable everywhere; it is not the ranger.

import {
  type BuildContext,
  type Field,
  hex,
  meshVolume,
  sd,
  sdf,
  type Vec3,
} from '@developerz.ai/ts23d';

const GREY = hex('#8d8f8c');

/** Left-side landmarks, metres (stature 1.78): joint centres of the a-pose. */
const HIP: Vec3 = [0, 0.1, 0.92];
const KNEE: Vec3 = [0.01, 0.16, 0.5];
const ANKLE: Vec3 = [-0.02, 0.22, 0.09];
const TOE: Vec3 = [0.16, 0.26, 0.05];
const SHOULDER: Vec3 = [-0.01, 0.2, 1.42];
const ELBOW: Vec3 = [-0.02, 0.31, 1.17];
const WRIST: Vec3 = [0.05, 0.43, 0.96];

const HAND_R = 0.04;

const mirror = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** Every form joined with a fillet of `k` metres: one surface with no crease (QA `connections`). */
const blend = (k: number, fields: readonly Field[]): Field =>
  fields.reduce((a, b) => sd.smoothUnion(k, a, b));

function side(m: (p: Vec3) => Vec3, hand: Vec3): Field[] {
  const limb = (a: Vec3, b: Vec3, r: number): Field => sd.capsule(m(a), m(b), r);
  return [
    limb(HIP, KNEE, 0.085),
    limb(KNEE, ANKLE, 0.06),
    limb(ANKLE, TOE, 0.05),
    limb(SHOULDER, ELBOW, 0.052),
    limb(ELBOW, WRIST, 0.043),
    limb(WRIST, hand, HAND_R),
  ];
}

export function mannequin(ctx: BuildContext, name: string, mass: number, width: number): void {
  // The fingertips set the a-pose's overall width: the same box as the model tier (`real`).
  const hand: Vec3 = [0.1, width / 2 - HAND_R, 0.84];
  const field = blend(0.06, [
    sd.capsule([0, 0, 0.98], [0, 0, 1.36], 0.15),
    sd.capsule(mirror(SHOULDER), SHOULDER, 0.07),
    sd.capsule([0, 0, 1.45], [0, 0, 1.56], 0.055),
    sd.ellipsoid([0.01, 0, 1.66], [0.1, 0.08, 0.12]),
    ...side((p) => p, hand),
    ...side(mirror, hand),
  ]);
  const mesh = sdf({
    field,
    bounds: [
      [-0.4, -width, 0],
      [0.4, width, 1.9],
    ],
    resolution: ctx.pick([0.014, 0.024, 0.042]),
    color: GREY,
    symmetry: 'y',
  });
  ctx.part(name, mesh, { density: mass / Math.max(meshVolume(mesh), 1e-9) });
}
