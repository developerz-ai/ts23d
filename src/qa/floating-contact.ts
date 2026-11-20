// Contact the sparse surface samples miss (`floating-parts`): a post sunk 3 cm into its base has
// no sample within 2 cm of the base's skin, a 3 m rail through two 4 cm posts has none near
// either, and a probe through the middle of an open nose skin has none at all. Each edge of `a`
// is clipped to `b`'s box and measured against `b`'s triangles exactly (segment-contact.ts): an
// edge that passes through a triangle, or comes within reach of one anywhere along its length,
// is contact, whether `b` is closed or an open sheet. A part wholly inside a hollow closed part
// and clear of its walls crosses nothing: it still floats.

import type { Bounds, Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { TriangleBvh } from './contact-bvh.ts';
import { meshBounds } from './geometry-cache.ts';
import { nearestOnSegment, pieceFor, type TrianglesIn } from './segment-contact.ts';

interface Soup {
  /** 9 floats a triangle. */
  readonly T: Float32Array;
  readonly trianglesIn: TrianglesIn;
  /** Longest stretch of an edge asked of the index at once. */
  readonly piece: number;
}

const soups = new WeakMap<Mesh, Soup>();

/** `m`'s triangles unindexed, under a BVH that answers "which are near this box". */
function soupOf(m: Mesh): Soup {
  const hit = soups.get(m);
  if (hit) return hit;
  const T = new Float32Array(m.indices.length * 3);
  for (let i = 0; i < m.indices.length; i++) {
    const v = (m.indices[i] ?? 0) * 3;
    T[i * 3] = m.positions[v] ?? 0;
    T[i * 3 + 1] = m.positions[v + 1] ?? 0;
    T[i * 3 + 2] = m.positions[v + 2] ?? 0;
  }
  const bvh = new TriangleBvh(T);
  const b = meshBounds(m);
  const made: Soup = {
    T,
    trianglesIn: (lo, hi) => bvh.within(lo, hi),
    piece: pieceFor(dmath.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])),
  };
  soups.set(m, made);
  return made;
}

/** The part [t0, t1] of segment p → q inside `box` grown by `pad`, or null (slab clipping). */
function clip(p: Vec3, q: Vec3, box: Bounds, pad: number): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  for (const k of [0, 1, 2] as const) {
    const d = q[k] - p[k];
    const lo = box.min[k] - pad - p[k];
    const hi = box.max[k] + pad - p[k];
    if (Math.abs(d) < 1e-12) {
      if (lo > 0 || hi < 0) return null;
      continue;
    }
    const [a, b] = d > 0 ? [lo / d, hi / d] : [hi / d, lo / d];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** Every triangle edge of `a`, cut to where it passes `box` (+`pad`); an edge two triangles
 *  share comes twice, which costs little next to finding them. Return true from `visit` to stop. */
function eachEdge(
  a: Mesh,
  box: Bounds,
  pad: number,
  visit: (p: Vec3, q: Vec3) => boolean,
): boolean {
  const P = a.positions;
  const at = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
  const on = (p: Vec3, q: Vec3, t: number): Vec3 =>
    t <= 0
      ? p
      : t >= 1
        ? q
        : [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  for (let t = 0; t < a.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const p = at(a.indices[t + e] ?? 0);
      const q = at(a.indices[t + ((e + 1) % 3)] ?? 0);
      const span = clip(p, q, box, pad);
      if (span && visit(on(p, q, span[0]), on(p, q, span[1]))) return true;
    }
  return false;
}

/** An edge of `a` passes through a triangle of `b` or comes within `eps` of one. `_grid` (`b`'s
 *  point grid) is not consulted: the segment test asks `b`'s own triangle tree. */
export function edgesTouch(a: Mesh, b: Mesh, eps: number): boolean {
  const { T, trianglesIn, piece } = soupOf(b);
  return eachEdge(
    a,
    meshBounds(b),
    eps,
    (p, q) => nearestOnSegment(p, q, T, trianglesIn, eps, eps, piece) !== null,
  );
}

/** Least distance from `a`'s edges to `b`'s surface, searched out to `reach` (exact along every
 *  edge, so `_grid` and the sampling `_step` the callers still pass are not used). */
export function edgeGap(a: Mesh, b: Mesh, reach: number): number {
  const { T, trianglesIn, piece } = soupOf(b);
  let best = reach;
  eachEdge(a, meshBounds(b), reach, (p, q) => {
    best = nearestOnSegment(p, q, T, trianglesIn, 0, best, piece)?.gap ?? best;
    return best <= 0;
  });
  return best;
}
