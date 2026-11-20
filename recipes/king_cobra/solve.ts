// Cobra pose solving: joint targets to local bone rotations, and keys to a clip. Rotations are the
// change of each bone's (tangent, dorsal) frame from rest, so a roll never creeps in on the coil.

import type { BodyPlan, Clip, Quat, Track, Vec3 } from '@developerz.ai/ts23d';
import { dmath, quatRotate } from '@developerz.ai/ts23d';
import { add, cross, dot, norm, scale, sub } from '../_lib/body-plan-kit.ts';

export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
export const qaxis = (v: Vec3): Quat => {
  const a = dmath.hypot(v[0], v[1], v[2]);
  if (a < 1e-9) return [0, 0, 0, 1];
  const s = dmath.sin(a / 2) / a;
  return [v[0] * s, v[1] * s, v[2] * s, dmath.cos(a / 2)];
};

/** Rotation whose columns are the orthonormal basis (x, y, z). */
function basisQuat(x: Vec3, y: Vec3, z: Vec3): Quat {
  const [m00, m10, m20, m01, m11, m21, m02, m12, m22] = [...x, ...y, ...z] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const l = dmath.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

const frameQuat = (t: Vec3, d: Vec3): Quat => {
  const x = norm(t);
  const z = norm(sub(d, scale(x, dot(d, x))));
  return basisQuat(x, cross(z, x), z);
};

/** Joint targets for one key: spine heads (links + 1) and each link's dorsal direction. */
export interface SpinePose {
  readonly at: readonly Vec3[];
  readonly dorsal: readonly Vec3[];
}

export interface CobraRig {
  readonly plan: BodyPlan;
  readonly spine: readonly string[];
  /** Hood ribs with the local rotation that folds each flat, per unit of fold. */
  readonly ribs: readonly { readonly bone: string; readonly fold: Vec3 }[];
  readonly tongue: readonly string[];
  /** Unit direction the tongue withdraws along, into the mouth. */
  readonly tongueBack: Vec3;
}

export function restPose(
  plan: BodyPlan,
  spine: readonly string[],
  dorsalOf: (i: number) => Vec3,
): SpinePose {
  const bones = spine.map((n) => plan.bones.find((b) => b.name === n));
  const at = bones.map((b) => b?.head ?? ([0, 0, 0] as Vec3));
  const last = bones.at(-1);
  return { at: [...at, last?.tail ?? [0, 0, 0]], dorsal: spine.map((_, i) => dorsalOf(i)) };
}

export interface KeyOut {
  readonly root: Vec3;
  readonly rot: Map<string, Quat>;
  readonly offset: Map<string, Vec3>;
}

/**
 * Local rotations that put each bone on its target. Bones keep their length, so a target that
 * stretches leaves an error that grows down the chain from the head; `pin` names the joint that must
 * land exactly (the first on the ground), and the root absorbs the difference at the head instead.
 */
export function solveSpine(rig: CobraRig, rest: SpinePose, p: SpinePose, pin?: number): KeyOut {
  const rot = new Map<string, Quat>();
  let parent: Quat = [0, 0, 0, 1];
  let reached = p.at[0] as Vec3;
  let pinned = reached;
  rig.spine.forEach((name, i) => {
    const seg = (q: SpinePose): Vec3 => sub(q.at[i + 1] as Vec3, q.at[i] as Vec3);
    const from = frameQuat(seg(rest), rest.dorsal[i] as Vec3);
    const to = frameQuat(seg(p), p.dorsal[i] as Vec3);
    const world = qmul(to, qconj(from));
    rot.set(name, qmul(qconj(parent), world));
    parent = world;
    reached = add(reached, quatRotate(world, seg(rest)));
    if (i + 1 === pin) pinned = reached;
  });
  const slip = pin === undefined ? ([0, 0, 0] as Vec3) : sub(p.at[pin] as Vec3, pinned);
  return { root: add(sub(p.at[0] as Vec3, rest.at[0] as Vec3), slip), rot, offset: new Map() };
}

export function bake(
  rig: CobraRig,
  name: string,
  seconds: number,
  loop: boolean,
  n: number,
  key: (k: number, time: number) => KeyOut,
): Clip {
  const times = Float32Array.from({ length: n + 1 }, (_, i) => (i * seconds) / n);
  const keys = Array.from({ length: n + 1 }, (_, i) => key(i, (i * seconds) / n));
  const names = [...new Set(keys.flatMap((k) => [...k.rot.keys()]))];
  const tracks: Track[] = [
    {
      bone: rig.plan.root,
      path: 'translation',
      times,
      values: Float32Array.from(keys.flatMap((k) => [...k.root])),
    },
  ];
  for (const bone of new Set(keys.flatMap((k) => [...k.offset.keys()])))
    tracks.push({
      bone,
      path: 'translation',
      times,
      values: Float32Array.from(keys.flatMap((k) => [...(k.offset.get(bone) ?? [0, 0, 0])])),
    });
  for (const bone of names) {
    const values = new Float32Array(keys.length * 4);
    let prev: Quat = [0, 0, 0, 1];
    keys.forEach((k, i) => {
      let q = k.rot.get(bone) ?? ([0, 0, 0, 1] as Quat);
      if (q[0] * prev[0] + q[1] * prev[1] + q[2] * prev[2] + q[3] * prev[3] < 0)
        q = [-q[0], -q[1], -q[2], -q[3]];
      values.set(q, i * 4);
      prev = q;
    });
    tracks.push({ bone, path: 'rotation', times, values });
  }
  return { name, seconds, loop, tracks };
}

/** Shortest-path blend of two rotations, k 0 gives a. */
export function qslerp(a: Quat, b: Quat, k: number): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  const c = Math.min(1, Math.abs(d));
  const th = dmath.acos(c);
  const [wa, wb] =
    th < 1e-5
      ? [1 - k, k * s]
      : [dmath.sin((1 - k) * th) / dmath.sin(th), (s * dmath.sin(k * th)) / dmath.sin(th)];
  const q: Quat = [
    a[0] * wa + b[0] * wb,
    a[1] * wa + b[1] * wb,
    a[2] * wa + b[2] * wb,
    a[3] * wa + b[3] * wb,
  ];
  const l = dmath.hypot(q[0], q[1], q[2], q[3]);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
