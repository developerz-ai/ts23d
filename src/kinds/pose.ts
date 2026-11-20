// Forward kinematics for baking clips (ADR 013): quaternion helpers and the world head + rotation
// of every bone for a pose — local rotations about each bone's head, an optional translation of
// the root — the same evaluation glTF joint nodes get (rest = translation only, skin-bind.ts).

import { type Bone, dmath, type Quat, quatRotate, type Vec3 } from '../core/index.ts';

export const IDENTITY: Quat = [0, 0, 0, 1];

/** Hamilton product a ⊗ b (apply b, then a). */
export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]);
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
};

/** Shortest-arc rotation turning direction u onto direction v (no twist about either). */
export function qbetween(u: Vec3, v: Vec3): Quat {
  const a = unit(u);
  const b = unit(v);
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    const p = unit(Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0]);
    return [p[0], p[1], p[2], 0];
  }
  const c: Vec3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const w = 1 + d;
  const l = dmath.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

/** Rotation by the vector's length (radians) about its direction; tiny vectors → identity. */
export function qexp(r: Vec3): Quat {
  const a = dmath.hypot(r[0], r[1], r[2]);
  if (a < 1e-12) return IDENTITY;
  const s = dmath.sin(a / 2) / a;
  return [r[0] * s, r[1] * s, r[2] * s, dmath.cos(a / 2)];
}

/** A pose: local rotation per bone (about its head, parent frame), translation of the roots, and
 *  extra translations of other bones' heads (parent frame: a scapula glide). */
export interface Pose {
  readonly rotation: ReadonlyMap<string, Quat>;
  readonly root?: Vec3;
  readonly offset?: ReadonlyMap<string, Vec3>;
}

export interface BoneWorld {
  readonly head: Vec3;
  readonly rot: Quat;
}

/** World head and rotation of every bone (parents precede children, as ctx.bone enforces). */
export function forward(bones: readonly Bone[], pose: Pose): Map<string, BoneWorld> {
  const out = new Map<string, BoneWorld>();
  const rest = new Map(bones.map((b) => [b.name, b.head]));
  const t = pose.root ?? [0, 0, 0];
  for (const b of bones) {
    const local = pose.rotation.get(b.name) ?? IDENTITY;
    const pw = b.parent === undefined ? undefined : out.get(b.parent);
    const ph = b.parent === undefined ? undefined : rest.get(b.parent);
    if (pw && ph) {
      const d = pose.offset?.get(b.name) ?? [0, 0, 0];
      const o = quatRotate(pw.rot, [
        b.head[0] - ph[0] + d[0],
        b.head[1] - ph[1] + d[1],
        b.head[2] - ph[2] + d[2],
      ]);
      out.set(b.name, {
        head: [pw.head[0] + o[0], pw.head[1] + o[1], pw.head[2] + o[2]],
        rot: qmul(pw.rot, local),
      });
    } else
      out.set(b.name, { head: [b.head[0] + t[0], b.head[1] + t[1], b.head[2] + t[2]], rot: local });
  }
  return out;
}

/** World tail of a bone under its world frame. */
export function tailOf(b: Bone, w: BoneWorld): Vec3 {
  const o = quatRotate(w.rot, [
    b.tail[0] - b.head[0],
    b.tail[1] - b.head[1],
    b.tail[2] - b.head[2],
  ]);
  return [w.head[0] + o[0], w.head[1] + o[1], w.head[2] + o[2]];
}
