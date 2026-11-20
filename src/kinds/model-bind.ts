// Skin weights for a model mesh on its fitted skeleton, in TS (the Blender output's own skin, if
// any, is replaced): geodesic distance through the voxelised solid from each bone (passes
// `heatWeights`), so a leg never bleeds onto the leg or the tail beside it across the gap, then
// limbs that touch in the mesh are told apart (a hanging tail fused to the hocks: a vertex inside
// a free leg follows no other leg and no tail bone, a tail vertex follows no leg), and the shared
// weight at each leg joint moves onto its half-angle helper (creature-helpers.ts).
// Each LOD mesh is bound on its own solid. ≤ 4 influences, quantised to 1/255, sums exactly 1.
// The weights are then relaxed over the surface (vertices welded by position, so a UV seam never
// opens) and cut back to 4 influences in 255ths.

import { type Bone, dmath, type Mesh, SKIN_INFLUENCES, type Vec3 } from '../core/index.ts';
import { capsuleDistance, heatWeights, weightBonesOf } from '../passes/index.ts';
import { MID, midTriples, splitMid } from './creature-helpers.ts';
import type { LegTrace } from './model-legs.ts';

/** Drops, per vertex, the influences its limb may not follow and rescales the rest to 255/255. */
function separateLimbs(
  mesh: Mesh,
  bones: readonly Bone[],
  legs: Readonly<Record<string, LegTrace>>,
): Mesh {
  const [J, W] = [mesh.joints, mesh.weights];
  if (!J || !W) return mesh;
  const weights = Float32Array.from(W);
  const stemOf = bones.map((x) => /(fore|hind)_[lr](?=_\d+$)/.exec(x.name)?.[0] ?? null);
  const tail = bones.map((x) => /tail_\d+$/.test(x.name));
  const seg = (keep: (i: number) => boolean) =>
    bones.flatMap((x, i) => (keep(i) && !x.name.endsWith(MID) ? [{ a: x.head, b: x.tail }] : []));
  const tails = seg((i) => tail[i] === true);
  const legBones = seg((i) => stemOf[i] !== null);
  const nearest = (p: Vec3, set: readonly { a: Vec3; b: Vec3 }[]): number =>
    set.reduce((d, t) => Math.min(d, capsuleDistance(p, t)), Infinity);
  // A vertex nearer the tail's bones than any leg bone is tail; below a free leg's top, any
  // other vertex belongs to the leg whose centre line is nearest at that height.
  const limbAt = (p: Vec3): string | null => {
    if (nearest(p, tails) < nearest(p, legBones)) return 'tail';
    let [best, d] = [null as string | null, Infinity];
    for (const [stem, t] of Object.entries(legs)) {
      if (p[2] >= t.top) continue;
      const s = t.line.reduce((q, l) => (Math.abs(l[0] - p[2]) < Math.abs(q[0] - p[2]) ? l : q));
      const e = dmath.hypot(p[0] - s[1], p[1] - s[2]);
      if (e < d) [best, d] = [stem, e];
    }
    return best;
  };
  for (let v = 0; v < weights.length / SKIN_INFLUENCES; v++) {
    const at = v * SKIN_INFLUENCES;
    const slots = [0, 1, 2, 3].map((k) => at + k);
    const limb = limbAt([
      mesh.positions[v * 3] ?? 0,
      mesh.positions[v * 3 + 1] ?? 0,
      mesh.positions[v * 3 + 2] ?? 0,
    ]);
    const isTail = limb === 'tail';
    const banned = (j: number): boolean =>
      isTail
        ? stemOf[j] !== null
        : limb !== null && (tail[j] === true || (stemOf[j] !== null && stemOf[j] !== limb));
    const keep = slots.filter((i) => (W[i] ?? 0) > 0 && !banned(J[i] ?? 0));
    if (keep.length === 0 || keep.length === slots.filter((i) => (W[i] ?? 0) > 0).length) continue;
    const sum = keep.reduce((q, i) => q + (W[i] ?? 0), 0);
    const q = keep.map((i) => Math.floor(((W[i] ?? 0) / sum) * 255));
    q[0] = (q[0] ?? 0) + 255 - q.reduce((x, y) => x + y, 0);
    for (const i of slots) weights[i] = 0;
    keep.forEach((i, k) => {
      weights[i] = (q[k] ?? 0) / 255;
    });
  }
  return { ...mesh, weights };
}

/** Rounds of surface relaxation: each spreads a weight boundary one edge ring further. */
const RELAX = 6;

/** Weights averaged with the edge neighbours' `rounds` times, then the 4 heaviest in 255ths. */
function relax(mesh: Mesh, bones: number, rounds: number): Mesh {
  const [J, W, P] = [mesh.joints, mesh.weights, mesh.positions];
  if (!J || !W) return mesh;
  const n = P.length / 3;
  const ids = new Map<string, number>();
  const id = Int32Array.from({ length: n }, (_, v) => {
    const key = `${P[v * 3]},${P[v * 3 + 1]},${P[v * 3 + 2]}`;
    const seen = ids.get(key);
    if (seen !== undefined) return seen;
    ids.set(key, ids.size);
    return ids.size - 1;
  });
  const m = ids.size;
  const links: Set<number>[] = Array.from({ length: m }, () => new Set());
  for (let t = 0; t < mesh.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = id[mesh.indices[t + e] ?? 0] ?? 0;
      const b = id[mesh.indices[t + ((e + 1) % 3)] ?? 0] ?? 0;
      if (a !== b) {
        links[a]?.add(b);
        links[b]?.add(a);
      }
    }
  // Each welded vertex starts at the mean of its copies' weights. An empty slot (joint 0, weight
  // 0) adds nothing, so it never wipes a real weight on bone 0.
  let field = new Float32Array(m * bones);
  const copies = new Uint32Array(m);
  for (let v = 0; v < n; v++) {
    const row = (id[v] ?? 0) * bones;
    copies[id[v] ?? 0] = (copies[id[v] ?? 0] ?? 0) + 1;
    for (let s = 0; s < SKIN_INFLUENCES; s++) {
      const w = W[v * 4 + s] ?? 0;
      if (w > 0) field[row + (J[v * 4 + s] ?? 0)] = (field[row + (J[v * 4 + s] ?? 0)] ?? 0) + w;
    }
  }
  for (let i = 0; i < field.length; i++)
    field[i] = (field[i] ?? 0) / Math.max(copies[Math.floor(i / bones)] ?? 1, 1);
  for (let r = 0; r < rounds; r++) {
    const next = new Float32Array(field.length);
    for (let v = 0; v < m; v++) {
      const near = links[v] ?? new Set<number>();
      for (let j = 0; j < bones; j++) {
        let sum = 0;
        for (const u of near) sum += field[u * bones + j] ?? 0;
        next[v * bones + j] =
          near.size > 0
            ? 0.5 * (field[v * bones + j] ?? 0) + (0.5 * sum) / near.size
            : (field[v * bones + j] ?? 0);
      }
    }
    field = next;
  }
  const joints = new Uint16Array(J.length);
  const weights = new Float32Array(W.length);
  for (let v = 0; v < n; v++) {
    const row = field.subarray((id[v] ?? 0) * bones, (id[v] ?? 0) * bones + bones);
    const top = [...row.keys()].sort((a, b) => (row[b] ?? 0) - (row[a] ?? 0) || a - b).slice(0, 4);
    const sum = top.reduce((q, j) => q + (row[j] ?? 0), 0) || 1;
    const q = top.map((j) => Math.floor(((row[j] ?? 0) / sum) * 255));
    q[0] = (q[0] ?? 0) + 255 - q.reduce((x, y) => x + y, 0);
    top.forEach((j, s) => {
      joints[v * 4 + s] = (q[s] ?? 0) > 0 ? j : 0;
      weights[v * 4 + s] = (q[s] ?? 0) / 255;
    });
  }
  return { ...mesh, joints, weights };
}

/** Weights snapped to 255ths that sum to exactly 255 per vertex (the heaviest takes the rest):
 *  what an imported float skin needs before `splitMid` and the `skin` gate. */
export function quantiseWeights(mesh: Mesh): Mesh {
  const W = mesh.weights;
  if (!W) return mesh;
  const weights = new Float32Array(W.length);
  for (let v = 0; v < W.length; v += SKIN_INFLUENCES) {
    const sum = (W[v] ?? 0) + (W[v + 1] ?? 0) + (W[v + 2] ?? 0) + (W[v + 3] ?? 0) || 1;
    const q = [0, 1, 2, 3].map((s) => Math.round(((W[v + s] ?? 0) / sum) * 255));
    const top = q.indexOf(Math.max(...q));
    q[top] = (q[top] ?? 0) + 255 - q.reduce((a, b) => a + b, 0);
    q.forEach((x, s) => {
      weights[v + s] = x / 255;
    });
  }
  return { ...mesh, weights };
}

const bound = new WeakMap<Float32Array, WeakMap<readonly Bone[], Mesh>>();

/** `mesh` skinned to `bones` (asset frame, the fitted armature with its helpers); `height` is
 *  the plan's: the voxel is 1/64 of it, the falloff 1/40. `legs` are the free legs fitSkeleton
 *  traced. Memoised per mesh and armature. */
export function bindModel(
  mesh: Mesh,
  bones: readonly Bone[],
  height: number,
  legs: Readonly<Record<string, LegTrace>> = {},
): Mesh {
  const seen = bound.get(mesh.positions)?.get(bones);
  if (seen) return seen;
  const only = bones.flatMap((x, i) => (x.name.endsWith(MID) ? [] : [i]));
  const heat = heatWeights(mesh, weightBonesOf(bones), {
    cell: height / 64,
    blend: height / 40,
    only,
  });
  // Relaxing averages over the surface, so across a tail fused to a hock it hands tail weight
  // back to the leg and leg weight to the tail: the limbs are separated again after it.
  const relaxed = relax(separateLimbs(heat, bones, legs), bones.length, RELAX);
  const out = splitMid(separateLimbs(relaxed, bones, legs), midTriples(bones));
  const per = bound.get(mesh.positions) ?? new WeakMap<readonly Bone[], Mesh>();
  per.set(bones, out);
  bound.set(mesh.positions, per);
  return out;
}
