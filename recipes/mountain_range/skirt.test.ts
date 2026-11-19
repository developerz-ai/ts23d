// Skirt walls from a surface's border row. Failure first: a border point at or under the base
// cannot carry a wall; otherwise every wall top is a border vertex's exact position.

import { describe, expect, it } from 'bun:test';
import { heightfield } from '@developerz.ai/ts23d';
import { withSkirt } from './skirt.ts';

const surface = (lift: number) =>
  heightfield({
    rect: [-0.3, -0.3, 0.3, 0.3],
    cells: [3, 5],
    height: (x, y) => lift + x * 0.7 - y * 0.3,
    color: [0.5, 0.5, 0.5],
  });

describe('withSkirt', () => {
  it('refuses a border that dips to the base', () => {
    expect(() => withSkirt(surface(0.1), [3, 5], 0)).toThrow(/not above the base/);
  });
  it('adds two triangles per border cell, tops on the border vertices, normals out', () => {
    const s = surface(2);
    const m = withSkirt(s, [3, 5], 0);
    expect(m.indices.length / 3 - s.indices.length / 3).toBe(2 * 2 * (3 + 5));
    const border = new Set<string>();
    for (let i = 0; i < s.positions.length / 3; i++) {
      const p = Array.from(s.positions.subarray(i * 3, i * 3 + 3));
      if (Math.abs(Math.abs(p[0] ?? 0) - 0.3) < 1e-6 || Math.abs(Math.abs(p[1] ?? 0) - 0.3) < 1e-6)
        border.add(p.join(','));
    }
    for (let i = s.positions.length / 3; i < m.positions.length / 3; i++) {
      const [x, y, z] = Array.from(m.positions.subarray(i * 3, i * 3 + 3));
      const [nx, ny] = Array.from(m.normals.subarray(i * 3, i * 3 + 2));
      // Outward: the normal points the way the vertex sits from the centre.
      expect((nx ?? 0) * (x ?? 0) + (ny ?? 0) * (y ?? 0)).toBeGreaterThan(0);
      if (z !== 0) expect(border.has([x, y, z].join(','))).toBe(true);
    }
    // Counter-clockwise seen from outside: each wall triangle's winding agrees with its normal.
    const P = (k: number): number[] => Array.from(m.positions.subarray(k * 3, k * 3 + 3));
    for (let t = s.indices.length; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
      const [pa, pb, pc] = [P(a), P(b), P(c)];
      const e1 = pb.map((v, k) => v - (pa[k] ?? 0));
      const e2 = pc.map((v, k) => v - (pa[k] ?? 0));
      const cross = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      ];
      const n = Array.from(m.normals.subarray(a * 3, a * 3 + 2));
      expect((cross[0] ?? 0) * (n[0] ?? 0) + (cross[1] ?? 0) * (n[1] ?? 0)).toBeGreaterThan(0);
    }
  });
});
