// Foot lock for a body that shifts on planted legs: a hydra's strike recoil moves the root, and every
// foot with it, so each leg is solved back onto its rest ground point at every key. Two joints (hip,
// knee) turn by damped least squares, the last bone counter-turns to keep the foot flat, and what a
// nearly straight leg cannot reach goes into a small slide of the foot joint. The chain the
// legs hang from must not rotate in the clip: only the root's translation is corrected for.

import { type Clip, type Quat, quatRotate, Ts23dError, type Vec3 } from '../core/index.ts';
import type { PlanChain } from './body-plan-types.ts';
import { IDENTITY, qconj, qexp, qmul } from './pose.ts';

const ITERATIONS = 6;
/** Keeps a nearly straight leg from swinging wildly: what it refuses goes into the slide. */
const DAMPING = 0.02;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Solves the symmetric 3×3 system (rows) · x = e by Cramer's rule. */
function solve3(m: readonly [Vec3, Vec3, Vec3], e: Vec3): Vec3 {
  const [a, b, c] = m;
  const det = a[0] * cross(b, c)[0] + a[1] * cross(b, c)[1] + a[2] * cross(b, c)[2];
  const col = (k: 0 | 1 | 2): number => {
    const r = (row: Vec3, v: number): Vec3 =>
      k === 0 ? [v, row[1], row[2]] : k === 1 ? [row[0], v, row[2]] : [row[0], row[1], v];
    const [p, q, s] = [r(a, e[0]), r(b, e[1]), r(c, e[2])];
    const x = cross(q, s);
    return (p[0] * x[0] + p[1] * x[1] + p[2] * x[2]) / det;
  };
  return [col(0), col(1), col(2)];
}

/** Adds r's term of J·Jᵀ (|r|²I − r rᵀ, the arm of a rotation about a joint). */
function armTerm(m: [Vec3, Vec3, Vec3], r: Vec3): void {
  const l = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  for (const i of [0, 1, 2] as const) {
    const row: Vec3 = [...m[i]] as unknown as Vec3;
    const out: [number, number, number] = [row[0], row[1], row[2]];
    for (const j of [0, 1, 2] as const) out[j] += (i === j ? l : 0) - r[i] * r[j];
    m[i] = out;
  }
}

interface LegPose {
  /** Local turns of hip, knee and foot. */
  readonly turns: readonly [Quat, Quat, Quat];
  /** Slide of the foot joint in the shin's frame: what a nearly straight leg cannot reach. */
  readonly slide: Vec3;
}

/** The pose that keeps this leg's ankle on the ground while the root is at d. */
function solveLeg(leg: PlanChain, d: Vec3): LegPose {
  const [l0, l1, l2] = [leg.links[0], leg.links[1], leg.links[2]];
  if (!l0 || !l1 || !l2) return { turns: [IDENTITY, IDENTITY, IDENTITY], slide: [0, 0, 0] };
  const hip = l0.bone.head;
  const upper = sub(l1.bone.head, hip);
  const lower = sub(l2.bone.head, l1.bone.head);
  const target = sub(l2.bone.head, d);
  let w0: Quat = IDENTITY;
  let w1: Quat = IDENTITY;
  for (let i = 0; i < ITERATIONS; i++) {
    const knee = add(hip, quatRotate(w0, upper));
    const ankle = add(knee, quatRotate(w1, lower));
    const e = sub(target, ankle);
    const [r0, r1] = [sub(ankle, hip), sub(ankle, knee)];
    const m: [Vec3, Vec3, Vec3] = [
      [DAMPING, 0, 0],
      [0, DAMPING, 0],
      [0, 0, DAMPING],
    ];
    armTerm(m, r0);
    armTerm(m, r1);
    const y = solve3(m, e);
    w0 = qmul(qexp(cross(r0, y)), w0);
    w1 = qmul(qexp(cross(r1, y)), w1);
  }
  const reached = add(add(hip, quatRotate(w0, upper)), quatRotate(w1, lower));
  return {
    turns: [w0, qmul(qconj(w0), w1), qconj(w1)],
    slide: quatRotate(qconj(w1), sub(target, reached)),
  };
}

/** The clip with a rotation track per leg joint that holds every foot where it stood. */
export function lockFeet(clip: Clip, rootBone: string, legs: readonly PlanChain[]): Clip {
  const root = clip.tracks.find(
    (t) => 'bone' in t && t.bone === rootBone && t.path === 'translation',
  );
  if (!root) return clip;
  const n = root.times.length;
  for (const leg of legs)
    if (leg.links.length !== 3)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `leg '${leg.id}' has ${leg.links.length} links, foot lock solves 3`,
        fix: 'build the leg as hip, knee and foot links',
      });
  const added = legs.flatMap((leg) => {
    const values = leg.links.map(() => new Float32Array(n * 4));
    const slide = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const d: Vec3 = [
        root.values[k * 3] ?? 0,
        root.values[k * 3 + 1] ?? 0,
        root.values[k * 3 + 2] ?? 0,
      ];
      const pose = solveLeg(leg, d);
      slide.set(pose.slide, k * 3);
      pose.turns.forEach((q, j) => {
        const v = values[j];
        const back = k > 0 && v ? (v[(k - 1) * 4 + 3] ?? 1) * q[3] < 0 : false;
        v?.set(back ? [-q[0], -q[1], -q[2], -q[3]] : q, k * 4);
      });
    }
    const foot = leg.links[2]?.bone.name ?? '';
    return [
      ...leg.links.map((l, j) => ({
        bone: l.bone.name,
        path: 'rotation' as const,
        times: root.times,
        values: values[j] ?? new Float32Array(0),
      })),
      { bone: foot, path: 'translation' as const, times: root.times, values: slide },
    ];
  });
  return { ...clip, tracks: [...clip.tracks, ...added] };
}
