// Point-to-surface distance through a bounding-volume hierarchy. Long diagonal members (a 160 m
// lattice girder, a car's sweeping panel) fill thousands of cells of a uniform grid; a BVH holds
// each triangle once, so build is O(n log n) and a radius-capped query visits a few leaves.

import { pointTriDist } from './geometry.ts';

const LEAF = 4;

/** Reorder o[lo..hi) so o[k] holds the k-th smallest key, smaller ones before it (quickselect,
 *  middle pivot, ties broken by index — deterministic). */
function select(
  o: Int32Array,
  lo: number,
  hi: number,
  k: number,
  key: (t: number) => number,
): void {
  const less = (a: number, b: number): boolean => {
    const d = key(a) - key(b);
    return d < 0 || (d === 0 && a < b);
  };
  let l = lo;
  let r = hi - 1;
  while (l < r) {
    const pivot = o[(l + r) >> 1] ?? 0;
    let i = l;
    let j = r;
    while (i <= j) {
      while (less(o[i] ?? 0, pivot)) i++;
      while (less(pivot, o[j] ?? 0)) j--;
      if (i <= j) {
        const t = o[i] ?? 0;
        o[i] = o[j] ?? 0;
        o[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) r = j;
    else if (k >= i) l = i;
    else return;
  }
}

export class TriangleBvh {
  private readonly tri: Float64Array;
  /** Per node: min xyz, max xyz. */
  private readonly box: Float64Array;
  /** Per node: left child (inner) or first triangle slot (leaf). */
  private readonly link: Int32Array;
  private readonly right: Int32Array;
  private readonly count: Int32Array;
  private readonly order: Int32Array;
  private nodes = 0;
  private readonly stack: Int32Array;

  constructor(positions: Float32Array) {
    const n = positions.length / 9;
    this.tri = Float64Array.from(positions);
    this.order = new Int32Array(n).map((_, i) => i);
    const cap = 2 * n + 1;
    this.box = new Float64Array(cap * 6);
    this.link = new Int32Array(cap);
    this.right = new Int32Array(cap);
    this.count = new Int32Array(cap);
    this.stack = new Int32Array(128);
    const centre = new Float64Array(n * 3);
    for (let t = 0; t < n; t++)
      for (let k = 0; k < 3; k++)
        centre[t * 3 + k] =
          ((this.tri[t * 9 + k] ?? 0) +
            (this.tri[t * 9 + 3 + k] ?? 0) +
            (this.tri[t * 9 + 6 + k] ?? 0)) /
          3;
    if (n > 0) this.build(0, n, centre);
  }

  private build(start: number, end: number, centre: Float64Array): number {
    const node = this.nodes++;
    const B = this.box;
    for (let k = 0; k < 3; k++) {
      B[node * 6 + k] = Infinity;
      B[node * 6 + 3 + k] = -Infinity;
    }
    for (let i = start; i < end; i++) {
      const t = this.order[i] ?? 0;
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) {
          const x = this.tri[t * 9 + v * 3 + k] ?? 0;
          if (x < (B[node * 6 + k] ?? 0)) B[node * 6 + k] = x;
          if (x > (B[node * 6 + 3 + k] ?? 0)) B[node * 6 + 3 + k] = x;
        }
    }
    if (end - start <= LEAF) {
      this.link[node] = start;
      this.count[node] = end - start;
      return node;
    }
    let axis = 0;
    let wide = -1;
    for (let k = 0; k < 3; k++) {
      const w = (B[node * 6 + 3 + k] ?? 0) - (B[node * 6 + k] ?? 0);
      if (w > wide) {
        wide = w;
        axis = k;
      }
    }
    const mid = (start + end) >> 1;
    select(this.order, start, end, mid, (t) => centre[t * 3 + axis] ?? 0);
    this.count[node] = 0;
    this.link[node] = this.build(start, mid, centre);
    this.right[node] = this.build(mid, end, centre);
    return node;
  }

  /** Distance from (x, y, z) to the nearest triangle within r, else Infinity. */
  nearest(x: number, y: number, z: number, r: number): number {
    if (this.nodes === 0) return Infinity;
    const B = this.box;
    const T = this.tri;
    let best = r;
    let found = false;
    let top = 0;
    this.stack[top++] = 0;
    while (top > 0) {
      const node = this.stack[--top] ?? 0;
      const o = node * 6;
      const dx = Math.max(0, (B[o] ?? 0) - x, x - (B[o + 3] ?? 0));
      const dy = Math.max(0, (B[o + 1] ?? 0) - y, y - (B[o + 4] ?? 0));
      const dz = Math.max(0, (B[o + 2] ?? 0) - z, z - (B[o + 5] ?? 0));
      if (dx * dx + dy * dy + dz * dz > best * best) continue;
      const c = this.count[node] ?? 0;
      if (c > 0) {
        const s = this.link[node] ?? 0;
        for (let i = s; i < s + c; i++) {
          const q = (this.order[i] ?? 0) * 9;
          const d = pointTriDist(
            x,
            y,
            z,
            T[q] ?? 0,
            T[q + 1] ?? 0,
            T[q + 2] ?? 0,
            T[q + 3] ?? 0,
            T[q + 4] ?? 0,
            T[q + 5] ?? 0,
            T[q + 6] ?? 0,
            T[q + 7] ?? 0,
            T[q + 8] ?? 0,
          );
          if (d <= best) {
            best = d;
            found = true;
          }
        }
        continue;
      }
      if (top + 2 > this.stack.length) continue;
      this.stack[top++] = this.right[node] ?? 0;
      this.stack[top++] = this.link[node] ?? 0;
    }
    return found ? best : Infinity;
  }

  /** Triangles whose boxes overlap [lo, hi], ascending (deterministic). */
  within(lo: readonly number[], hi: readonly number[]): number[] {
    const out: number[] = [];
    if (this.nodes === 0) return out;
    const B = this.box;
    const T = this.tri;
    const stack = [0];
    while (stack.length > 0) {
      const node = stack.pop() ?? 0;
      const o = node * 6;
      let miss = false;
      for (let k = 0; k < 3; k++)
        if ((B[o + k] ?? 0) > (hi[k] ?? 0) || (B[o + 3 + k] ?? 0) < (lo[k] ?? 0)) miss = true;
      if (miss) continue;
      const c = this.count[node] ?? 0;
      if (c === 0) {
        stack.push(this.right[node] ?? 0, this.link[node] ?? 0);
        continue;
      }
      const s0 = this.link[node] ?? 0;
      for (let i = s0; i < s0 + c; i++) {
        const t = this.order[i] ?? 0;
        let hit = true;
        for (let k = 0; k < 3 && hit; k++) {
          const a = T[t * 9 + k] ?? 0;
          const b = T[t * 9 + 3 + k] ?? 0;
          const d = T[t * 9 + 6 + k] ?? 0;
          if (Math.min(a, b, d) > (hi[k] ?? 0) || Math.max(a, b, d) < (lo[k] ?? 0)) hit = false;
        }
        if (hit) out.push(t);
      }
    }
    return out.sort((a, b) => a - b);
  }
}
