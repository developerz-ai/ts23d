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
