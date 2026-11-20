// The path tracer's BVH against brute force: misses are misses, the closest hit wins, filters drop
// hits, shadow rays stop at the first kept hit.

import { describe, expect, it } from 'bun:test';
import { dmath } from '../../core/index.ts';
import { newHit, PathBvh } from './bvh.ts';

/** A deterministic soup of n small triangles in the unit cube (LCG, no Math.random). */
function soup(n: number): { p: Float32Array; i: Uint32Array } {
  let s = 12345;
  const r = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const p = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const c = [r(), r(), r()];
    for (let v = 0; v < 3; v++)
      for (let k = 0; k < 3; k++) p[t * 9 + v * 3 + k] = (c[k] ?? 0) + (r() - 0.5) * 0.1;
  }
  return { p, i: new Uint32Array(n * 3).map((_, j) => j) };
}

/** Brute-force closest t over every triangle (Möller–Trumbore). */
function brute(p: Float32Array, o: number[], d: number[]): number {
  let best = Infinity;
  for (let t = 0; t < p.length / 9; t++) {
    const v = (j: number, k: number): number => p[t * 9 + j * 3 + k] ?? 0;
    const e1 = [0, 1, 2].map((k) => v(1, k) - v(0, k));
    const e2 = [0, 1, 2].map((k) => v(2, k) - v(0, k));
    const cr = (a: number[], b: number[]) => [
      (a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
      (a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
      (a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
    ];
    const dt = (a: number[], b: number[]) =>
      (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
    const pv = cr(d, e2);
    const det = dt(e1, pv);
    if (Math.abs(det) < 1e-18) continue;
    const s = [0, 1, 2].map((k) => (o[k] ?? 0) - v(0, k));
    const u = dt(s, pv) / det;
    const q = cr(s, e1);
    const w = dt(d, q) / det;
    const tt = dt(e2, q) / det;
    if (u >= 0 && w >= 0 && u + w <= 1 && tt > 0 && tt < best) best = tt;
  }
  return best;
}

describe('PathBvh', () => {
  const { p, i } = soup(2000);
  const bvh = new PathBvh(p, i);

  it('reports a miss for a ray that passes every triangle', () => {
    const h = newHit();
    expect(bvh.closest([5, 5, 5], [1, 0, 0], Infinity, h)).toBe(false);
    expect(h.tri).toBe(-1);
    expect(bvh.occluded([5, 5, 5], [0, 1, 0], Infinity)).toBe(false);
  });

  it('finds the same closest hit as brute force', () => {
    const h = newHit();
    for (let k = 0; k < 200; k++) {
      const o = [-1, (k % 20) / 20 + 0.02, Math.floor(k / 20) / 10 + 0.03];
      const d = [1, 0.05 * dmath.sin(k), 0.05 * dmath.cos(k)];
      const l = dmath.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0);
      const dn = d.map((x) => x / l);
      const want = brute(p, o, dn);
      const got = bvh.closest(o, dn, Infinity, h) ? h.t : Infinity;
      if (want === Infinity) expect(got).toBe(Infinity);
      else expect(Math.abs(got - want)).toBeLessThan(1e-9);
    }
  });

  it('skips hits the filter rejects and respects tmax', () => {
    const tri = new Float32Array([0, -1, -1, 0, 1, -1, 0, 0, 1, 1, -1, -1, 1, 1, -1, 1, 0, 1]);
    const two = new PathBvh(tri, new Uint32Array([0, 1, 2, 3, 4, 5]));
    const h = newHit();
    expect(two.closest([-1, 0, 0], [1, 0, 0], Infinity, h)).toBe(true);
    expect(h.tri).toBe(0);
    expect(h.t).toBeCloseTo(1, 12);
    expect(two.closest([-1, 0, 0], [1, 0, 0], Infinity, h, (t) => t !== 0)).toBe(true);
    expect(h.tri).toBe(1);
    expect(two.closest([-1, 0, 0], [1, 0, 0], 0.5, h)).toBe(false);
    expect(two.occluded([-1, 0, 0], [1, 0, 0], Infinity, () => false)).toBe(false);
    expect(two.occluded([-1, 0, 0], [1, 0, 0], 1.5)).toBe(true);
  });

  it('builds over an empty scene', () => {
    const empty = new PathBvh(new Float32Array(0), new Uint32Array(0));
    expect(empty.closest([0, 0, 0], [1, 0, 0], Infinity, newHit())).toBe(false);
  });
});
