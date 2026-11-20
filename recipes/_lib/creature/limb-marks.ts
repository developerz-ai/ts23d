// Bony landmarks and hollows on a creature-kind leg, for `options.body` (left side; the sculpt
// mirrors them): the elbow point (olecranon) behind the elbow, the carpus broad and flat-fronted
// with the accessory carpal pad behind it, the patella proud of the stifle, the hock's calcaneus
// point with the Achilles tendon standing off the tibia and the hollow between them, and the toes
// split by grooves between the knuckles so a paw reads as digits, not a mitten. Digitigrade
// (wolf, fox) and plantigrade (bear) feet differ in where the heel sits; sizes are shares of the
// leg's own radius at each joint, so the same call fits a fox and a bear. LOD2 returns nothing
// (the kind's far legs are tubes outside the sculpt); grooves and hollows are LOD0 only (LOD1's
// cell is wider than a groove).

import type { Bones, Lod, SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

type Leg = Bones['legs'][number];

export interface LimbMarks {
  /** Landmark size × the default (1 = a lean short-coated canid's; less under a long coat). */
  readonly bone?: number;
  /** Depth of the hollows × the default (0 = none). */
  readonly hollow?: number;
  /** Groove depth between the toes × the default (0 = toes left joined). */
  readonly toes?: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
/** Degrees of pitch (about Y) that lay an ellipsoid's long Z axis along a → b. */
const pitchOf = (a: Vec3, b: Vec3): number =>
  (dmath.atan2(a[0] - b[0], a[2] - b[2]) * 180) / Math.PI;

/** Toe knuckle centres, as the kind lays them (creature-feet.ts): an arc, middle toes leading. */
export function knuckles(l: Leg): Vec3[] {
  const [sx, sy, sz] = l.footSize;
  const n = l.toes;
  const k = n > 1 ? 3 / (n - 1) : 0;
  return Array.from({ length: n }, (_, i) => i - (n - 1) / 2).map((j) => [
    l.foot[0] + sx * (0.62 - 0.22 * Math.abs(j) * k),
    l.foot[1] + j * sy * 0.5 * k,
    sz * 0.45,
  ]);
}

function foreMarks(l: Leg, lod: Lod, o: Required<LimbMarks>): SculptEdit[] {
  const [, E, C, P] = l.joints;
  const [, rE, rC] = l.radii;
  if (!E || !C || !P || rE === undefined || rC === undefined) return [];
  const b = o.bone;
  const out: SculptEdit[] = [
    // Olecranon: a blunt point behind the elbow, the triceps' insertion.
    {
      shape: 'ellipsoid',
      at: add(E, [-rE * 0.95, 0, rE * 0.1]),
      size: [rE * 0.36 * b, rE * 0.34 * b, rE * 0.48 * b],
      rotate: [0, 20, 0],
      blend: rE * 0.18,
    },
    // Carpus: a touch broader than the forearm above it, its front a flat plate. Not scaled with
    // `bone`: at 1.35 × it swelled into a ring round the wrist.
    {
      shape: 'ellipsoid',
      at: add(C, [rC * 0.08, 0, 0]),
      size: [rC * 0.9, rC * 1.06, rC * 0.55],
      blend: rC * 0.3,
    },
    // Accessory carpal pad: a knob behind the wrist (the "stopper" pad).
    {
      shape: 'ellipsoid',
      at: add(C, [-rC * 0.95, 0, -rC * 0.25]),
      size: [rC * 0.38 * b, rC * 0.36 * b, rC * 0.42 * b],
      blend: rC * 0.16,
    },
  ];
  if (lod === 0 && o.hollow > 0)
    // The flexor tendons stand off the radius above the wrist: a shallow groove between them on
    // the outside of the lower forearm.
    out.push({
      shape: 'ellipsoid',
      at: add(lerp(E, C, 0.68), [-rC * 0.35, rC * 1.08, 0]),
      size: [rC * 0.22, rC * 0.2 * o.hollow, rC * 1.6],
      rotate: [0, pitchOf(E, C), 0],
      op: 'subtract',
      blend: rC * 0.3,
    });
  return out;
}

function hindMarks(l: Leg, lod: Lod, plantigrade: boolean, o: Required<LimbMarks>): SculptEdit[] {
  const [, K, Hk, P] = l.joints;
  const [, rK, rH] = l.radii;
  if (!K || !Hk || !P || rK === undefined || rH === undefined) return [];
  const b = o.bone;
  // The calcaneus: high behind the cannon on a digitigrade leg; the bear's heel is on the ground.
  const heel = plantigrade
    ? add(Hk, [-rH * 1.0, 0, -rH * 0.2])
    : add(Hk, [-rH * 1.05, 0, rH * 0.45]);
  const out: SculptEdit[] = [
    // Patella: proud of the front of the stifle.
    {
      shape: 'ellipsoid',
      at: add(K, [rK * 0.62, rK * 0.05, rK * 0.05]),
      size: [rK * 0.3 * b, rK * 0.34 * b, rK * 0.42 * b],
      blend: rK * 0.2,
    },
    // Point of the hock.
    {
      shape: 'ellipsoid',
      at: heel,
      size: [rH * 0.42 * b, rH * 0.4 * b, rH * 0.55 * b],
      rotate: [0, -20, 0],
      blend: rH * 0.2,
    },
    // The hock joint itself: broader than the shank above and the cannon below.
    {
      shape: 'ellipsoid',
      at: Hk,
      size: [rH * 0.95 * b, rH * 1.02 * b, rH * 0.75 * b],
      blend: rH * 0.35,
    },
  ];
  if (!plantigrade)
    // Achilles tendon: a cord from the calf to the point of the hock, standing off the tibia.
    out.push({
      shape: 'capsule',
      at: add(lerp(K, Hk, 0.4), [-rK * 0.62, 0, 0]),
      to: heel,
      size: rH * 0.26 * b,
      blend: rH * 0.25,
    });
  if (lod === 0 && o.hollow > 0 && !plantigrade)
    // The hollow between that tendon and the tibia, on the outside of the shank above the hock.
    out.push({
      shape: 'ellipsoid',
      at: add(lerp(K, Hk, 0.72), [-rH * 0.45, rH * 1.0, 0]),
      size: [rH * 0.3, rH * 0.24 * o.hollow, rH * 1.4],
      rotate: [0, pitchOf(K, Hk), 0],
      op: 'subtract',
      blend: rH * 0.35,
    });
  return out;
}

/** Grooves between neighbouring toe knuckles, over the top and down the front of the toes. */
function toeGrooves(l: Leg, depth: number): SculptEdit[] {
  const ks = knuckles(l);
  const [sx, sy, sz] = l.footSize;
  const k = l.toes > 1 ? 3 / (l.toes - 1) : 0;
  const out: SculptEdit[] = [];
  for (let i = 0; i + 1 < ks.length; i++) {
    const a = ks[i];
    const c = ks[i + 1];
    if (!a || !c) continue;
    const m = lerp(a, c, 0.5);
    out.push({
      shape: 'ellipsoid',
      at: [m[0] + sx * 0.06, m[1], sz * 0.9],
      size: [sx * 0.34, sy * 0.12 * k * depth, sz * 0.42],
      rotate: [0, 16, 0],
      op: 'subtract',
      blend: sz * 0.06,
    });
  }
  return out;
}

/** `options.body` for a creature-kind mammal: landmarks on every leg, both sides. */
export function limbMarks(o: LimbMarks = {}): (b: Bones, lod: Lod) => SculptEdit[] {
  const all: Required<LimbMarks> = { bone: o.bone ?? 1, hollow: o.hollow ?? 1, toes: o.toes ?? 1 };
  return (b, lod) => {
    if (lod === 2) return [];
    const plantigrade = b.stance === 'plantigrade';
    return b.legs.flatMap((l) => [
      ...(l.name === 'fore' ? foreMarks(l, lod, all) : hindMarks(l, lod, plantigrade, all)),
      ...(lod === 0 && all.toes > 0 && l.hoof === null && l.toes > 1
        ? toeGrooves(l, all.toes)
        : []),
    ]);
  };
}
