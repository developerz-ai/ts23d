// Skin weights from bone fields (ADR 013): per vertex, the distance d_i to each bone's tapered
// capsule (segment head → tail, radius r1 → r2: the flesh the bone carries), weights
// w_i = exp(−(d_i − d_min) / k) with k the sculpt's blend radius, the top 4 kept, renormalised and
// quantised to 1/255 so they sum to exactly 1 in every engine. `skinPieces` binds each connected
// piece rigidly with the weights at its root (fur cards, claws): a card rides the skin under it.

import { type Mesh, SKIN_INFLUENCES, Ts23dError, type Vec3 } from '../core/index.ts';

/** The flesh a bone carries, asset frame: a capsule from `a` (radius r1) to `b` (radius r2). */
export interface WeightBone {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly r1?: number;
  readonly r2?: number;
}

export interface SkinWeightOptions {
  /** Falloff k, metres: the sculpt's blend radius. Bones farther than d_min + 6k get nothing. */
  readonly blend: number;
  /** Bone indices this mesh may follow (default: all). */
  readonly only?: readonly number[];
  /** Added to every position first: the part's place in the asset frame. */
  readonly offset?: Vec3;
}

/** Quantisation step of a weight: 1/255 (unorm8-exact, sums stay exactly 1). */
export const WEIGHT_STEP = 1 / 255;

const v3 = (f: (k: number) => number): Vec3 => [f(0), f(1), f(2)];

/** Distance from p to the tapered capsule, negative inside. */
export function capsuleDistance(p: Vec3, s: WeightBone): number {
  const ux = s.b[0] - s.a[0];
  const uy = s.b[1] - s.a[1];
  const uz = s.b[2] - s.a[2];
  const l2 = ux * ux + uy * uy + uz * uz;
  const px = p[0] - s.a[0];
  const py = p[1] - s.a[1];
  const pz = p[2] - s.a[2];
  const t = l2 > 0 ? Math.min(1, Math.max(0, (px * ux + py * uy + pz * uz) / l2)) : 0;
  const r = (s.r1 ?? 0) + ((s.r2 ?? s.r1 ?? 0) - (s.r1 ?? 0)) * t;
  return Math.hypot(px - ux * t, py - uy * t, pz - uz * t) - r;
}

/**
 * Up to 4 (bone, weight) pairs, heaviest first, quantised to 1/255 with largest-remainder rounding
 * (ties to the lower slot) so the 255ths sum to exactly 255.
 */
export function quantise(pairs: readonly (readonly [number, number])[]): [number, number][] {
  const top = [...pairs]
    .sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, SKIN_INFLUENCES)
    .filter(([, w]) => w > 0);
  const sum = top.reduce((s, [, w]) => s + w, 0);
  if (!(sum > 0)) return [];
  const raw = top.map(([, w]) => (w / sum) * 255);
  const q = raw.map(Math.floor);
  let left = 255 - q.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((x, y) => y[0] - x[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    q[i] = (q[i] ?? 0) + 1;
    left--;
  }
  return top
    .map(([j], i): [number, number] => [j, q[i] ?? 0])
    .filter(([, w]) => w > 0)
    .sort((x, y) => y[1] - x[1] || x[0] - y[0]);
}

export function checkBones(bones: readonly WeightBone[], o: SkinWeightOptions): readonly number[] {
  if (!(Number.isFinite(o.blend) && o.blend > 0))
    throw new Ts23dError('T3D_SKIN_INVALID', {
      cause: `skin blend ${o.blend} m is not > 0`,
      fix: 'pass the sculpt blend radius in metres, e.g. blend: 0.02',
    });
  const only = o.only ?? bones.map((_, i) => i);
  if (only.length === 0 || only.some((i) => !Number.isInteger(i) || i < 0 || i >= bones.length))
    throw new Ts23dError('T3D_SKIN_INVALID', {
      cause: `skin bone set [${only.join(', ')}] is empty or outside 0..${bones.length - 1}`,
      fix: 'list indices into the skeleton the mesh is bound to',
    });
  return only;
}

/** Quantised influences from distances d[n] to bones only[n]: exp(−(d − d_min)/k), top 4. */
export function influencesFrom(
  d: readonly number[],
  only: readonly number[],
  k: number,
): [number, number][] {
  const min = Math.min(...d);
  const pairs: [number, number][] = [];
  only.forEach((j, n) => {
    const x = ((d[n] ?? Infinity) - min) / k;
    if (x <= 6) pairs.push([j, Math.exp(-x)]);
  });
  return quantise(pairs);
}

const influencesAt = (
  p: Vec3,
  bones: readonly WeightBone[],
  only: readonly number[],
  k: number,
): [number, number][] =>
  influencesFrom(
    only.map((i) => capsuleDistance(p, bones[i] as WeightBone)),
    only,
    k,
  );

/** Joints + weights arrays (4 per vertex) from quantised influences per vertex. */
export function writeInfluences(
  joints: Uint16Array,
  weights: Float32Array,
  v: number,
  q: readonly (readonly [number, number])[],
): void {
  q.forEach(([j, w], s) => {
    joints[v * SKIN_INFLUENCES + s] = j;
    weights[v * SKIN_INFLUENCES + s] = w * WEIGHT_STEP;
  });
}

/** Smooth weights per vertex. Same mesh, plus joints + weights (4 per vertex). */
export function skinWeights(mesh: Mesh, bones: readonly WeightBone[], o: SkinWeightOptions): Mesh {
  const only = checkBones(bones, o);
  const off = o.offset ?? [0, 0, 0];
  const n = mesh.positions.length / 3;
  const joints = new Uint16Array(n * SKIN_INFLUENCES);
  const weights = new Float32Array(n * SKIN_INFLUENCES);
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [
      (mesh.positions[v * 3] ?? 0) + off[0],
      (mesh.positions[v * 3 + 1] ?? 0) + off[1],
      (mesh.positions[v * 3 + 2] ?? 0) + off[2],
    ];
    writeInfluences(joints, weights, v, influencesAt(p, bones, only, o.blend));
  }
  return { ...mesh, joints, weights };
}

/** Every vertex fully on one bone (eyes on `head`, a jaw on `jaw`). */
export function bindRigid(mesh: Mesh, joint: number): Mesh {
  const n = mesh.positions.length / 3;
  const joints = new Uint16Array(n * SKIN_INFLUENCES);
  const weights = new Float32Array(n * SKIN_INFLUENCES);
  for (let v = 0; v < n; v++) {
    joints[v * SKIN_INFLUENCES] = joint;
    weights[v * SKIN_INFLUENCES] = 1;
  }
  return { ...mesh, joints, weights };
}

/** Connected pieces (shared indices) → piece id per vertex, numbered by lowest vertex. */
export function pieceIds(mesh: Mesh): Int32Array {
  const n = mesh.positions.length / 3;
  const up = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((up[r] ?? r) !== r) r = up[r] ?? r;
    let c = i;
    while (c !== r) {
      const next = up[c] ?? r;
      up[c] = r;
      c = next;
    }
    return r;
  };
  const join = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
  };
  for (let t = 0; t < mesh.indices.length; t += 3) {
    join(mesh.indices[t] ?? 0, mesh.indices[t + 1] ?? 0);
    join(mesh.indices[t] ?? 0, mesh.indices[t + 2] ?? 0);
  }
  // Split normals / UV seams duplicate a vertex: the same point (1 µm grid) is the same piece.
  const at = new Map<string, number>();
  for (let v = 0; v < n; v++) {
    const key = v3((k) => Math.round((mesh.positions[v * 3 + k] ?? 0) * 1e6)).join();
    const first = at.get(key);
    if (first === undefined) at.set(key, v);
    else join(first, v);
  }
  return up.map((_, i) => find(i));
}

/**
 * Rigid per connected piece: every vertex of a piece takes the smooth weights at its root, the
 * midpoint of its two lowest vertices (hair cards put the buried root there).
 */
export function skinPieces(mesh: Mesh, bones: readonly WeightBone[], o: SkinWeightOptions): Mesh {
  const only = checkBones(bones, o);
  const off = o.offset ?? [0, 0, 0];
  const ids = pieceIds(mesh);
  const n = ids.length;
  const second = new Int32Array(n).fill(-1);
  for (let v = 0; v < n; v++) {
    const r = ids[v] ?? v;
    if (r !== v && (second[r] ?? -1) < 0) second[r] = v;
  }
  const at = (v: number, k: number): number => mesh.positions[v * 3 + k] ?? 0;
  const joints = new Uint16Array(n * SKIN_INFLUENCES);
  const weights = new Float32Array(n * SKIN_INFLUENCES);
  const memo = new Map<number, [number, number][]>();
  for (let v = 0; v < n; v++) {
    const r = ids[v] ?? v;
    let q = memo.get(r);
    if (!q) {
      const s = (second[r] ?? -1) < 0 ? r : (second[r] ?? r);
      const p = v3((k) => (at(r, k) + at(s, k)) / 2 + (off[k] ?? 0));
      q = influencesAt(p, bones, only, o.blend);
      memo.set(r, q);
    }
    writeInfluences(joints, weights, v, q);
  }
  return { ...mesh, joints, weights };
}
