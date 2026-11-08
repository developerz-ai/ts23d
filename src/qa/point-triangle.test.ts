import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { pointTriangleDistance } from './point-triangle.ts';

const a: Vec3 = [0, 0, 0];
const b: Vec3 = [2, 0, 0];
const c: Vec3 = [0, 2, 0];

/** Brute force: densest barycentric sampling of the triangle. */
const brute = (p: Vec3): number => {
  let best = Infinity;
  const N = 200;
  for (let i = 0; i <= N; i++)
    for (let j = 0; i + j <= N; j++) {
      const u = i / N;
      const v = j / N;
      const q = [
        a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v,
        a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v,
        0,
      ];
      best = Math.min(best, Math.hypot(p[0] - (q[0] ?? 0), p[1] - (q[1] ?? 0), p[2] - (q[2] ?? 0)));
    }
  return best;
};

describe('pointTriangleDistance', () => {
  test('a point beyond the hypotenuse is not measured to the plane (would read 0)', () => {
    expect(pointTriangleDistance([2, 2, 0], a, b, c)).toBeCloseTo(Math.SQRT2, 9);
  });
  test('every Voronoi region matches brute force', () => {
    const probes: Vec3[] = [
      [-1, -1, 0.5],
      [3, -0.5, 0.2],
      [-0.5, 3, -0.3],
      [1, -1, 1],
      [-1, 1, 0],
      [1.5, 1.5, 0.4],
      [0.5, 0.5, 0.7],
      [0.3, 0.2, -2],
    ];
    for (const p of probes)
      expect(Math.abs(pointTriangleDistance(p, a, b, c) - brute(p))).toBeLessThan(0.02);
  });
});
