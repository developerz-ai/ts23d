import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount, type Vec3 } from '../core/index.ts';
import { loft, ringXY } from './loft.ts';

const C: Vec3 = [0.6, 0.5, 0.2];

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** Sum of normal · (vertex − axis point at that height): > 0 everywhere means outward. */
const outward = (m: Mesh): boolean => {
  for (let i = 0; i < m.positions.length / 3; i++) {
    const x = m.positions[i * 3] ?? 0;
    const y = m.positions[i * 3 + 1] ?? 0;
    const d = x * (m.normals[i * 3] ?? 0) + y * (m.normals[i * 3 + 1] ?? 0);
    if (Math.hypot(x, y) > 1e-6 && d <= 0) return false;
  }
  return true;
};

describe('loft', () => {
  it('throws T3D_RECIPE_INVALID with a fix on degenerate rings', () => {
    expect(fails(() => loft({ rings: [ringXY([0, 0, 0], 1, 1, 8)], color: C })).fix).toContain(
      'at least 2 rings',
    );
    const uneven = fails(() =>
      loft({ rings: [ringXY([0, 0, 0], 1, 1, 8), ringXY([0, 0, 1], 1, 1, 6)], color: C }),
    );
    expect(uneven.code).toBe('T3D_RECIPE_INVALID');
    expect(uneven.fix).toContain('same vertex count');
    const thin = fails(() =>
      loft({
        rings: [
          [
            [0, 0, 0],
            [1, 0, 0],
          ],
          [
            [0, 0, 1],
            [1, 0, 1],
          ],
        ],
        color: C,
      }),
    );
    expect(thin.fix).toContain('3');
  });

  it('triangle count = 2·N·(R−1) + N per cap', () => {
    for (const [n, r] of [
      [3, 2],
      [8, 4],
      [16, 7],
    ] as const) {
      const rings = Array.from({ length: r }, (_, i) => ringXY([0, 0, i], 1, 0.5, n));
      expect(triangleCount(loft({ rings, color: C }))).toBe(2 * n * (r - 1));
      const capped = loft({ rings, color: C, capStart: true, capEnd: true });
      expect(triangleCount(capped)).toBe(2 * n * (r - 1) + 2 * n);
    }
  });

  it('bounds follow the ellipse radii', () => {
    const m = loft({ rings: [ringXY([0, 0, 0], 2, 1, 16), ringXY([0, 0, 3], 2, 1, 16)], color: C });
    const b = boundsOf(m);
    expect(b.max[0]).toBeCloseTo(2, 5);
    expect(b.min[1]).toBeCloseTo(-1, 5);
    expect(b.max[2]).toBeCloseTo(3, 5);
  });

  it('smooth normals point outward whichever way the rings wind', () => {
    const up = [0, 1, 2].map((z) => ringXY([0, 0, z], 1, 1, 12));
    expect(outward(loft({ rings: up, color: C }))).toBe(true);
    expect(outward(loft({ rings: up.map((r) => [...r].reverse()), color: C }))).toBe(true);
    // A haystack: the top ring collapses to a point; the apex must not produce NaN normals.
    const stack = loft({
      rings: [
        ringXY([0, 0, 0], 1, 1, 8),
        ringXY([0, 0, 1], 1.1, 1.1, 8),
        ringXY([0, 0, 2], 0, 0, 8),
      ],
      color: C,
    });
    expect([...stack.normals].every(Number.isFinite)).toBe(true);
  });

  it('wobble scales the radius per angle; colour callback runs per vertex; deterministic', () => {
    const lobes = (a: number): number => 1 + 0.5 * Math.max(0, Math.cos(4 * a));
    const ring = ringXY([0, 0, 0], 1, 1, 16, lobes);
    expect(Math.hypot(ring[0]?.[0] ?? 0, ring[0]?.[1] ?? 0)).toBeCloseTo(1.5, 5);
    const o = {
      rings: [ring, ringXY([0, 0, 1], 1, 1, 16)],
      color: (_r: readonly Vec3[], i: number): Vec3 => (i === 0 ? [1, 0, 0] : [0, 0, 1]),
    };
    const m = loft(o);
    expect(m.colors[0]).toBe(1);
    expect(m.colors[m.colors.length - 1]).toBe(1);
    expect(Bun.hash(m.positions)).toBe(Bun.hash(loft(o).positions));
  });

  it("uv 'length' tiles U in metres along the loft; 'row' tiles U around", () => {
    const rings = [ringXY([0, 0, 0], 1, 1, 8), ringXY([0, 0, 4], 1, 1, 8)];
    const len = loft({ rings, color: C });
    expect(len.uvs[len.uvs.length - 2]).toBeCloseTo(2, 5); // 4 m over a 2 m strip
    const row = loft({ rings, color: C, uv: 'row' });
    expect(row.uvs[8 * 2]).toBeGreaterThan(2.9); // ~6.12 m of perimeter / 2 m
  });
});
