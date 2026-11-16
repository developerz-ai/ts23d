// Ray–triangle queries for the path tracer: a binned-SAH bounding-volume hierarchy over the scene's
// triangles. Render cannot import qa (same tier), so this is its own copy; the node layout mirrors
// qa/contact-bvh.ts (box · link = left child or first slot · right · count). Closest hit with an
// optional surface filter (alpha-tested cards drop out), and an any-hit query for shadow rays.
// Deterministic: fixed bins, fixed axis order, ties keep the first split found.

import { BINS, LEAF, sahSplit } from './bvh-sah.ts';

const STACK = 256;

/** True when the hit at (tri, b1, b2) counts (a cutout texel above the alpha cut, say). */
export type HitFilter = (tri: number, b1: number, b2: number) => boolean;

/** Closest-hit record: distance along the ray, triangle and its barycentrics of vertices b, c. */
export interface Hit {
  t: number;
  tri: number;
  b1: number;
  b2: number;
}

export const newHit = (): Hit => ({ t: 0, tri: -1, b1: 0, b2: 0 });

export class PathBvh {
  /** Per node: min xyz, max xyz. */
  private readonly box: Float64Array;
  private readonly link: Int32Array;
  private readonly right: Int32Array;
  private readonly count: Int32Array;
  /** Per slot (leaf order): v0, e1 = v1 − v0, e2 = v2 − v0. */
  private readonly tri: Float64Array;
  /** Slot → scene triangle index. */
  private readonly id: Int32Array;
  private readonly stack = new Int32Array(STACK);
  private nodes = 0;

  constructor(positions: Float32Array, indices: Uint32Array) {
    const n = indices.length / 3;
    const order = new Int32Array(n).map((_, i) => i);
    const tb = new Float64Array(n * 6);
    const cen = new Float64Array(n * 3);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 3; k++) {
        const a = positions[(indices[t * 3] ?? 0) * 3 + k] ?? 0;
        const b = positions[(indices[t * 3 + 1] ?? 0) * 3 + k] ?? 0;
        const c = positions[(indices[t * 3 + 2] ?? 0) * 3 + k] ?? 0;
        tb[t * 6 + k] = Math.min(a, b, c);
        tb[t * 6 + 3 + k] = Math.max(a, b, c);
        cen[t * 3 + k] = (a + b + c) / 3;
      }
    const cap = 2 * n + 1;
    this.box = new Float64Array(cap * 6);
    this.link = new Int32Array(cap);
    this.right = new Int32Array(cap);
    this.count = new Int32Array(cap);
    if (n > 0) this.build(order, 0, n, tb, cen);
    this.tri = new Float64Array(n * 9);
    this.id = order;
    for (let s = 0; s < n; s++) {
      const t = order[s] ?? 0;
      for (let k = 0; k < 3; k++) {
        const a = positions[(indices[t * 3] ?? 0) * 3 + k] ?? 0;
        this.tri[s * 9 + k] = a;
        this.tri[s * 9 + 3 + k] = (positions[(indices[t * 3 + 1] ?? 0) * 3 + k] ?? 0) - a;
        this.tri[s * 9 + 6 + k] = (positions[(indices[t * 3 + 2] ?? 0) * 3 + k] ?? 0) - a;
      }
    }
  }

  private build(o: Int32Array, start: number, end: number, tb: Float64Array, cen: Float64Array) {
    const node = this.nodes++;
    const B = this.box;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) {
      B[node * 6 + k] = Infinity;
      B[node * 6 + 3 + k] = -Infinity;
    }
    for (let i = start; i < end; i++) {
      const t = o[i] ?? 0;
      for (let k = 0; k < 3; k++) {
        B[node * 6 + k] = Math.min(B[node * 6 + k] ?? 0, tb[t * 6 + k] ?? 0);
        B[node * 6 + 3 + k] = Math.max(B[node * 6 + 3 + k] ?? 0, tb[t * 6 + 3 + k] ?? 0);
        const c = cen[t * 3 + k] ?? 0;
        lo[k] = Math.min(lo[k] ?? 0, c);
        hi[k] = Math.max(hi[k] ?? 0, c);
      }
    }
    const n = end - start;
    const split = n <= LEAF ? null : sahSplit(o, start, end, tb, cen, lo, hi, area(B, node * 6));
    if (!split) {
      this.link[node] = start;
      this.count[node] = n;
      return node;
    }
    const [axis, at] = split;
    const k0 = lo[axis] ?? 0;
    const scale = BINS / ((hi[axis] ?? 0) - k0);
    let i = start;
    let j = end - 1;
    while (i <= j) {
      const t = o[i] ?? 0;
      if (Math.min(BINS - 1, Math.floor(((cen[t * 3 + axis] ?? 0) - k0) * scale)) <= at) i++;
      else {
        o[i] = o[j] ?? 0;
        o[j--] = t;
      }
    }
    const mid = i === start || i === end ? (start + end) >> 1 : i;
    this.count[node] = 0;
    this.link[node] = this.build(o, start, mid, tb, cen);
    this.right[node] = this.build(o, mid, end, tb, cen);
    return node;
  }

  /** Closest hit with t in (0, tmax) that `filter` keeps; fills `hit`, returns whether found. */
  closest(o: ArrayLike<number>, d: ArrayLike<number>, tmax: number, hit: Hit, f?: HitFilter) {
    hit.tri = -1;
    hit.t = tmax;
    this.walk(o, d, hit, false, f);
    return hit.tri >= 0;
  }

  /** Any kept hit with t in (0, tmax): the shadow-ray query. */
  occluded(o: ArrayLike<number>, d: ArrayLike<number>, tmax: number, f?: HitFilter): boolean {
    const h = newHit();
    h.t = tmax;
    this.walk(o, d, h, true, f);
    return h.tri >= 0;
  }

  private walk(o: ArrayLike<number>, d: ArrayLike<number>, h: Hit, any: boolean, f?: HitFilter) {
    if (this.nodes === 0) return;
    const ox = o[0] ?? 0;
    const oy = o[1] ?? 0;
    const oz = o[2] ?? 0;
    const dx = d[0] ?? 0;
    const dy = d[1] ?? 0;
    const dz = d[2] ?? 0;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    const B = this.box;
    const T = this.tri;
    const S = this.stack;
    let top = 0;
    S[top++] = 0;
    while (top > 0) {
      const node = S[--top] ?? 0;
      const b = node * 6;
      let t0 = ((B[b] ?? 0) - ox) * ix;
      let t1 = ((B[b + 3] ?? 0) - ox) * ix;
      let near = Math.min(t0, t1);
      let far = Math.max(t0, t1);
      t0 = ((B[b + 1] ?? 0) - oy) * iy;
      t1 = ((B[b + 4] ?? 0) - oy) * iy;
      near = Math.max(near, Math.min(t0, t1));
      far = Math.min(far, Math.max(t0, t1));
      t0 = ((B[b + 2] ?? 0) - oz) * iz;
      t1 = ((B[b + 5] ?? 0) - oz) * iz;
      near = Math.max(near, Math.min(t0, t1));
      far = Math.min(far, Math.max(t0, t1));
      if (!(near <= far * 1.0000001) || far < 0 || near > h.t) continue;
      const c = this.count[node] ?? 0;
      if (c === 0) {
        if (top + 2 > STACK) continue;
        S[top++] = this.right[node] ?? 0;
        S[top++] = this.link[node] ?? 0;
        continue;
      }
      const s0 = this.link[node] ?? 0;
      for (let s = s0; s < s0 + c; s++) {
        const q = s * 9;
        const e1x = T[q + 3] ?? 0;
        const e1y = T[q + 4] ?? 0;
        const e1z = T[q + 5] ?? 0;
        const e2x = T[q + 6] ?? 0;
        const e2y = T[q + 7] ?? 0;
        const e2z = T[q + 8] ?? 0;
        const px = dy * e2z - dz * e2y;
        const py = dz * e2x - dx * e2z;
        const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-18 && det < 1e-18) continue;
        const inv = 1 / det;
        const sx = ox - (T[q] ?? 0);
        const sy = oy - (T[q + 1] ?? 0);
        const sz = oz - (T[q + 2] ?? 0);
        const u = (sx * px + sy * py + sz * pz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y;
        const qy = sz * e1x - sx * e1z;
        const qz = sx * e1y - sy * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t <= 0 || t >= h.t) continue;
        const id = this.id[s] ?? 0;
        if (f && !f(id, u, v)) continue;
        h.t = t;
        h.tri = id;
        h.b1 = u;
        h.b2 = v;
        if (any) return;
      }
    }
  }
}

const area = (B: Float64Array, o: number): number => {
  const x = (B[o + 3] ?? 0) - (B[o] ?? 0);
  const y = (B[o + 4] ?? 0) - (B[o + 1] ?? 0);
  const z = (B[o + 5] ?? 0) - (B[o + 2] ?? 0);
  return x * y + y * z + z * x;
};
