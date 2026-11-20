// Fairing: bi-Laplacian smoothing of a mesh's positions that keeps its creases. Grid-meshed SDFs
// (sculpt, sdf) carry voxel ripple; fairing irons it out without the shrinkage of plain Laplacian
// smoothing (the bi-Laplacian's shrink falls with the 4th power of cell / radius). Each step is
// x ← x − λ · w · L(L(x)), L the umbrella operator over the position-welded mesh, applied to all
// vertices at once (Jacobi), so the result does not depend on vertex order. w is 1 on smooth
// surface and fades to 0 where faces meet at more than `creaseAngle` (keep: 'creases'); open
// boundaries never move. w also scales the first Laplacian, so a pinned crease adds no curvature. Normals are recomputed (area-weighted) where vertices moved.

import { dmath, type Mesh, Ts23dError } from '../core/index.ts';

export interface FairOptions {
  /** Smoothing steps (fixed: deterministic). 0 returns the mesh unchanged. */
  readonly iterations: number;
  /** 'creases' (default): pin sharp edges; 'none': smooth everything but open boundaries. */
  readonly keep?: 'creases' | 'none';
  /** Dihedral angle, degrees, at which a vertex is pinned; half of it starts the fade. Default 35. */
  readonly creaseAngle?: number;
}

/** Step size: stable for λ ≤ ½ (the umbrella bi-Laplacian's eigenvalues lie in [0, 4]). */
const LAMBDA = 0.25;

export function fair(m: Mesh, o: FairOptions): Mesh {
  const iters = o.iterations;
  if (!Number.isInteger(iters) || iters < 0 || iters > 1000)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `fair iterations is ${iters}`,
      fix: 'use a whole number of steps 0–1000; 2–10 irons out voxel ripple',
    });
  const crease = o.creaseAngle ?? 35;
  if (!(crease > 0 && crease <= 180))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `fair creaseAngle is ${crease}`,
      fix: 'give the angle in degrees, 0 < creaseAngle ≤ 180 (35 keeps eyelids and panel edges)',
    });
  if (iters === 0) return m;
  // Weld by exact position, in index order (deterministic ids).
  const ids = new Map<string, number>();
  const weld = new Int32Array(m.positions.length / 3);
  const P: number[] = [];
  for (let i = 0; i < weld.length; i++) {
    const [x, y, z] = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const key = `${x},${y},${z}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = P.length / 3;
      ids.set(key, id);
      P.push(x, y, z);
    }
    weld[i] = id;
  }
  const n = P.length / 3;
  const tri = (t: number, k: number): number => weld[m.indices[t * 3 + k] ?? 0] ?? 0;
  const tris = m.indices.length / 3;
  // Undirected edges → their faces; neighbour lists sorted for a fixed summation order.
  const edgeFaces = new Map<number, number[]>();
  const nbr: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let t = 0; t < tris; t++)
    for (let k = 0; k < 3; k++) {
      const a = tri(t, k);
      const b = tri(t, (k + 1) % 3);
      if (a === b) continue;
      nbr[a]?.add(b);
      nbr[b]?.add(a);
      const key = Math.min(a, b) * n + Math.max(a, b);
      const f = edgeFaces.get(key);
      if (f) f.push(t);
      else edgeFaces.set(key, [t]);
    }
  const ring = nbr.map((s) => [...s].sort((a, b) => a - b));
  const fn = faceNormals(P, tris, tri);
  // Weight per vertex: 0 on boundaries (and creases when kept), fading in below the crease angle.
  const w = new Float64Array(n).fill(1);
  const cosFull = dmath.cos((crease * Math.PI) / 180);
  const cosHalf = dmath.cos((crease * Math.PI) / 360);
  for (const [key, faces] of edgeFaces) {
    const a = Math.floor(key / n);
    const b = key % n;
    let s = 0;
    if (faces.length === 2 && o.keep === 'none') s = 1;
    else if (faces.length === 2) {
      const [f, g] = faces as [number, number];
      const dot = [0, 1, 2].reduce((d, k) => d + (fn[f * 3 + k] ?? 0) * (fn[g * 3 + k] ?? 0), 0);
      const len = (t: number): number =>
        dmath.hypot(fn[t * 3] ?? 0, fn[t * 3 + 1] ?? 0, fn[t * 3 + 2] ?? 0) || 1;
      const c = dot / (len(f) * len(g));
      s = c >= cosHalf ? 1 : c <= cosFull ? 0 : (c - cosFull) / (cosHalf - cosFull);
    }
    w[a] = Math.min(w[a] ?? 1, s);
    w[b] = Math.min(w[b] ?? 1, s);
  }
  let x = Float64Array.from(P);
  const lap = (src: Float64Array, out: Float64Array): void => {
    for (let v = 0; v < n; v++) {
      const r = ring[v] ?? [];
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (const u of r) s += src[u * 3 + k] ?? 0;
        out[v * 3 + k] = r.length > 0 ? s / r.length - (src[v * 3 + k] ?? 0) : 0;
      }
    }
  };
  const l1 = new Float64Array(n * 3);
  const l2 = new Float64Array(n * 3);
  for (let it = 0; it < iters; it++) {
    lap(x, l1);
    // A pinned vertex is a boundary condition with no curvature of its own: without this, the
    // umbrella across a crease (pointing into the solid) would bow the faces next to it.
    for (let i = 0; i < n * 3; i++) l1[i] = (l1[i] ?? 0) * (w[Math.floor(i / 3)] ?? 0);
    lap(l1, l2);
    const next = new Float64Array(n * 3);
    for (let i = 0; i < n * 3; i++)
      next[i] = (x[i] ?? 0) - LAMBDA * (w[Math.floor(i / 3)] ?? 0) * (l2[i] ?? 0);
    x = next;
  }
  return rebuild(m, x, weld, w, tris, tri);
}

function faceNormals(
  P: ArrayLike<number>,
  tris: number,
  tri: (t: number, k: number) => number,
): Float64Array {
  const out = new Float64Array(tris * 3);
  for (let t = 0; t < tris; t++) {
    const [a, b, c] = [tri(t, 0) * 3, tri(t, 1) * 3, tri(t, 2) * 3];
    const e = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
    const f = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
    const g = [
      (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
      (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
      (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
    ];
    // Area-weighted: the raw cross product (length = 2 · area).
    out.set(g, t * 3);
  }
  return out;
}

/** New positions on every copy of a welded vertex; moved vertices get area-weighted normals. */
function rebuild(
  m: Mesh,
  x: Float64Array,
  weld: Int32Array,
  w: Float64Array,
  tris: number,
  tri: (t: number, k: number) => number,
): Mesh {
  const n = x.length / 3;
  const fn = faceNormals(x, tris, tri);
  const acc = new Float64Array(n * 3);
  for (let t = 0; t < tris; t++)
    for (let k = 0; k < 3; k++) {
      const v = tri(t, k);
      for (let j = 0; j < 3; j++) acc[v * 3 + j] = (acc[v * 3 + j] ?? 0) + (fn[t * 3 + j] ?? 0);
    }
  const positions = new Float32Array(m.positions.length);
  const normals = Float32Array.from(m.normals);
  for (let i = 0; i < weld.length; i++) {
    const v = weld[i] ?? 0;
    for (let k = 0; k < 3; k++) positions[i * 3 + k] = x[v * 3 + k] ?? 0;
    if ((w[v] ?? 0) === 0) continue;
    const l = dmath.hypot(acc[v * 3] ?? 0, acc[v * 3 + 1] ?? 0, acc[v * 3 + 2] ?? 0);
    if (l > 0) for (let k = 0; k < 3; k++) normals[i * 3 + k] = (acc[v * 3 + k] ?? 0) / l;
  }
  return { ...m, positions, normals };
}
