// Clip evaluation for QA (ADR 013): a clip's keys sampled at a time (translation lerp, rotation
// nlerp — what glTF LINEAR does), and the joints' world heads and rotations under that pose, the
// same forward kinematics the GLB's joint nodes get (rest = translation only, keys relative).

import {
  type Armature,
  type Clip,
  dmath,
  type Quat,
  quatRotate,
  type Track,
  type Vec3,
} from '../core/index.ts';

export interface ClipPose {
  readonly rotation: Map<string, Quat>;
  /** Translation offset from the rest position, parent frame. */
  readonly translation: Map<string, Vec3>;
}

export interface JointWorld {
  readonly head: Vec3;
  readonly rot: Quat;
}

const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

function sample(tr: Track, time: number, stride: number): number[] {
  const t = tr.times;
  const n = t.length;
  const at = (i: number): number[] => [...tr.values.subarray(i * stride, i * stride + stride)];
  if (time <= (t[0] ?? 0)) return at(0);
  if (time >= (t[n - 1] ?? 0)) return at(n - 1);
  // The last key at or before `time`: binary search, because long clips are sampled at every frame.
  let i = 0;
  let hi = n - 2;
  while (i < hi) {
    const mid = (i + hi + 1) >> 1;
    if ((t[mid] ?? 0) <= time) i = mid;
    else hi = mid - 1;
  }
  const a = at(i);
  const b = at(i + 1);
  const u = (time - (t[i] ?? 0)) / ((t[i + 1] ?? 1) - (t[i] ?? 0));
  if (stride !== 4) return a.map((x, k) => x + ((b[k] ?? 0) - x) * u);
  const d = a.reduce((s, x, k) => s + x * (b[k] ?? 0), 0) < 0 ? -1 : 1;
  const q = a.map((x, k) => x + ((b[k] ?? 0) * d - x) * u);
  const l = dmath.norm(q);
  return q.map((x) => x / l);
}

/** The clip's bone keys at `time` seconds. */
export function clipPose(clip: Clip, time: number): ClipPose {
  const rotation = new Map<string, Quat>();
  const translation = new Map<string, Vec3>();
  for (const tr of clip.tracks) {
    if (!('bone' in tr)) continue;
    if (tr.path === 'rotation') {
      const [x = 0, y = 0, z = 0, w = 1] = sample(tr, time, 4);
      rotation.set(tr.bone, [x, y, z, w]);
    } else if (tr.path === 'translation') {
      const [x = 0, y = 0, z = 0] = sample(tr, time, 3);
      translation.set(tr.bone, [x, y, z]);
    }
  }
  return { rotation, translation };
}

/** World head + rotation of every joint (parents precede children). */
export function jointWorlds(sk: Armature, pose: ClipPose): Map<string, JointWorld> {
  const out = new Map<string, JointWorld>();
  const rest = new Map(sk.bones.map((b) => [b.name, b.head]));
  for (const b of sk.bones) {
    const r = pose.rotation.get(b.name) ?? [0, 0, 0, 1];
    const d = pose.translation.get(b.name) ?? [0, 0, 0];
    const p = b.parent === undefined ? undefined : out.get(b.parent);
    const ph = b.parent === undefined ? undefined : rest.get(b.parent);
    if (p && ph) {
      const o = quatRotate(p.rot, [
        b.head[0] - ph[0] + d[0],
        b.head[1] - ph[1] + d[1],
        b.head[2] - ph[2] + d[2],
      ]);
      out.set(b.name, {
        head: [p.head[0] + o[0], p.head[1] + o[1], p.head[2] + o[2]],
        rot: qmul(p.rot, r),
      });
    } else
      out.set(b.name, { head: [b.head[0] + d[0], b.head[1] + d[1], b.head[2] + d[2]], rot: r });
  }
  return out;
}
