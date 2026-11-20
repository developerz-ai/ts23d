// Bind-pose maths shared by the GLB writer and QA (ADR 013): joint nodes rest with no rotation,
// each translated by (head − parent head), so a joint's rest world matrix is a translation to its
// head and its inverse bind matrix the translation back. Linear-blend skinning of a mesh under any
// pose (local rotation per bone about its head) — the same sum every glTF engine evaluates.

import {
  type Armature,
  type Bone,
  dmath,
  type Mesh,
  type Quat,
  quatRotate,
  SKIN_INFLUENCES,
  type Vec3,
} from '../core/index.ts';
import type { WeightBone } from './skin-weights.ts';

/** A 4×4 matrix, column-major (glTF order). */
export type Mat4 = Float64Array;

/** Each bone's flesh capsule as its bare segment (no radius): the default weight field. */
export const weightBonesOf = (bones: readonly Bone[]): WeightBone[] =>
  bones.map((b) => ({ a: b.head, b: b.tail }));

/** Rest translation of each joint node relative to its parent joint (root: from the origin). */
export function jointLocals(sk: Armature): Vec3[] {
  const head = new Map(sk.bones.map((b) => [b.name, b.head]));
  return sk.bones.map((b) => {
    const p = b.parent === undefined ? undefined : head.get(b.parent);
    return p ? [b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]] : [...b.head];
  });
}

/** Inverse bind matrices, 16 floats per bone (float32: what the GLB stores). */
export function inverseBind(sk: Armature): Float32Array {
  const out = new Float32Array(sk.bones.length * 16);
  sk.bones.forEach((b, i) => {
    out.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1], i * 16);
  });
  return out;
}

const mul = (a: ArrayLike<number>, b: ArrayLike<number>): Mat4 => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      o[c * 4 + r] = s;
    }
  return o;
};

/** Rotation q about the origin then translation t, column-major. */
function trs(t: Vec3, q: Quat): Mat4 {
  const x = quatRotate(q, [1, 0, 0]);
  const y = quatRotate(q, [0, 1, 0]);
  const z = quatRotate(q, [0, 0, 1]);
  return Float64Array.from([...x, 0, ...y, 0, ...z, 0, ...t, 1]);
}

/**
 * World matrix of every joint for a pose: `rotation` per bone name, local (about the bone's head,
 * asset axes), the rest translation from `jointLocals`. Parents must precede children (as ctx.bone
 * enforces).
 */
export function poseJoints(sk: Armature, rotation: ReadonlyMap<string, Quat> = new Map()): Mat4[] {
  const locals = jointLocals(sk);
  const world = new Map<string, Mat4>();
  return sk.bones.map((b, i) => {
    const local = trs(locals[i] ?? [0, 0, 0], rotation.get(b.name) ?? [0, 0, 0, 1]);
    const parent = b.parent === undefined ? undefined : world.get(b.parent);
    const m = parent ? mul(parent, local) : local;
    world.set(b.name, m);
    return m;
  });
}

/** Linear-blend skinned positions: Σ w_i · (J_i · IBM_i) · v. */
export function skinPositions(
  mesh: Mesh,
  joints: readonly Mat4[],
  ibm: Float32Array,
): Float32Array {
  const skin = joints.map((j, i) => mul(j, ibm.subarray(i * 16, i * 16 + 16)));
  const out = new Float32Array(mesh.positions.length);
  const js = mesh.joints;
  const ws = mesh.weights;
  if (!js || !ws) {
    out.set(mesh.positions);
    return out;
  }
  for (let v = 0; v < out.length / 3; v++) {
    const x = mesh.positions[v * 3] ?? 0;
    const y = mesh.positions[v * 3 + 1] ?? 0;
    const z = mesh.positions[v * 3 + 2] ?? 0;
    for (let s = 0; s < SKIN_INFLUENCES; s++) {
      const w = ws[v * SKIN_INFLUENCES + s] ?? 0;
      const m = skin[js[v * SKIN_INFLUENCES + s] ?? 0];
      if (w === 0 || !m) continue;
      for (let r = 0; r < 3; r++)
        out[v * 3 + r] =
          (out[v * 3 + r] ?? 0) +
          w * ((m[r] ?? 0) * x + (m[4 + r] ?? 0) * y + (m[8 + r] ?? 0) * z + (m[12 + r] ?? 0));
    }
  }
  return out;
}

/** Largest distance (m) between the bind-pose skinned mesh and its rest positions. */
export function bindPoseError(mesh: Mesh, sk: Armature, ibm = inverseBind(sk)): number {
  const posed = skinPositions(mesh, poseJoints(sk), ibm);
  let worst = 0;
  for (let i = 0; i < posed.length; i += 3)
    worst = Math.max(
      worst,
      dmath.hypot(
        (posed[i] ?? 0) - (mesh.positions[i] ?? 0),
        (posed[i + 1] ?? 0) - (mesh.positions[i + 1] ?? 0),
        (posed[i + 2] ?? 0) - (mesh.positions[i + 2] ?? 0),
      ),
    );
  return worst;
}
