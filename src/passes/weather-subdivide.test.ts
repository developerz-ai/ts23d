import { describe, expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { subdivideTo } from './weather-subdivide.ts';
import { analyse } from './weather-surface.ts';

const longest = (m: ReturnType<typeof box>): number => {
  let best = 0;
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e] ?? 0;
      const b = m.indices[t + ((e + 1) % 3)] ?? 0;
      best = Math.max(
        best,
        Math.hypot(
          ...[0, 1, 2].map((k) => (m.positions[a * 3 + k] ?? 0) - (m.positions[b * 3 + k] ?? 0)),
        ),
      );
    }
  return best;
};

describe('subdivideTo', () => {
  it('leaves the mesh alone for a non-positive edge, and splits a box below the limit', () => {
    const b = box({ size: [1, 0.3, 2], color: [1, 1, 1] });
    expect(subdivideTo(b, 0)).toBe(b);
    const f = subdivideTo(b, 0.1);
    expect(longest(b)).toBeGreaterThan(0.1);
    expect(longest(f)).toBeLessThanOrEqual(0.1 + 1e-6);
  });

  it('keeps hard edges crack-free: every vertex on a face edge has a twin on the other face', () => {
    const f = subdivideTo(box({ size: [1, 0.3, 2], color: [1, 1, 1] }), 0.13);
    const s = analyse(f);
    // Welded box: one closed piece, every group shared by ≥ 1 vertex, area preserved.
    expect(s.pieces).toBe(1);
    const area = s.area.reduce((t, a) => t + a, 0);
    expect(area).toBeCloseTo(2 * (1 * 0.3 + 1 * 2 + 0.3 * 2), 4);
    // Euler characteristic of a closed sphere-like surface: V − E + F = 2 on welded groups.
    const edges = s.nbr.length / 2;
    expect(s.groups - edges + f.indices.length / 3).toBe(2);
  });
});

describe('subdivideTo on a skinned, morphed mesh', () => {
  it('interpolates weights (still summing to 1 on the 1/255 grid) and morph deltas', () => {
    const tri = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(6),
      colors: new Float32Array(9).fill(1),
      indices: new Uint32Array([0, 1, 2]),
      joints: new Uint16Array([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0]),
      weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
      morphs: [{ name: 'lift', positions: new Float32Array([0, 0, 0, 0, 0, 2, 0, 0, 4]) }],
    };
    const f = subdivideTo(tri, 0.3);
    const verts = f.positions.length / 3;
    expect(verts).toBeGreaterThan(3);
    expect(f.joints?.length).toBe(verts * 4);
    expect(f.weights?.length).toBe(verts * 4);
    expect(f.morphs?.[0]?.positions.length).toBe(verts * 3);
    for (let v = 0; v < verts; v++) {
      const w = [0, 1, 2, 3].map((s) => f.weights?.[v * 4 + s] ?? 0);
      expect(w.reduce((s, x) => s + Math.round(x * 255), 0)).toBe(255);
      for (const x of w) expect(Math.abs(x * 255 - Math.round(x * 255))).toBeLessThan(1e-4);
      // Barycentric by construction: bone 1 follows x, bone 2 follows y; the lift is 2x + 4y.
      const [x = 0, y = 0] = [f.positions[v * 3], f.positions[v * 3 + 1]];
      const of = (bone: number): number =>
        [0, 1, 2, 3].reduce((s, k) => s + (f.joints?.[v * 4 + k] === bone ? (w[k] ?? 0) : 0), 0);
      expect(Math.abs(of(1) - x)).toBeLessThan(0.02);
      expect(Math.abs(of(2) - y)).toBeLessThan(0.02);
      expect(f.morphs?.[0]?.positions[v * 3 + 2]).toBeCloseTo(2 * x + 4 * y, 5);
    }
  });
});
