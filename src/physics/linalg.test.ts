import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { eigenSym, frameWithY, quatFromAxes } from './linalg.ts';

const rotate = (q: readonly number[], v: Vec3): Vec3 => {
  const [x, y, z, w] = [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1];
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * (t[0] ?? 0) + (y * (t[2] ?? 0) - z * (t[1] ?? 0)),
    v[1] + w * (t[1] ?? 0) + (z * (t[0] ?? 0) - x * (t[2] ?? 0)),
    v[2] + w * (t[2] ?? 0) + (x * (t[1] ?? 0) - y * (t[0] ?? 0)),
  ];
};

describe('eigenSym', () => {
  it('a non-diagonal matrix is not its own diagonal', () => {
    const e = eigenSym([
      [2, 1, 0],
      [1, 2, 0],
      [0, 0, 1],
    ]);
    expect(e.values[0]).toBeCloseTo(3, 9);
    expect(e.values[1]).toBeCloseTo(1, 9);
    expect(e.values[2]).toBeCloseTo(1, 9);
    expect(Math.abs(e.axes[0][0])).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('reconstructs the matrix: A·v = λ·v for every axis', () => {
    const a: [Vec3, Vec3, Vec3] = [
      [4, 1, 0.5],
      [1, 3, -0.2],
      [0.5, -0.2, 1],
    ];
    const e = eigenSym(a);
    e.axes.forEach((v, k) => {
      const av = a.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
      av.forEach((x, i) => {
        expect(x).toBeCloseTo((e.values[k] ?? 0) * (v[i] ?? 0), 9);
      });
    });
  });
});

describe('quatFromAxes / frameWithY', () => {
  it('the quaternion maps +Y onto the requested axis', () => {
    for (const axis of [
      [1, 0, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.6, 0, 0.8],
    ] as Vec3[]) {
      const q = quatFromAxes(...frameWithY(axis));
      const y = rotate(q, [0, 1, 0]);
      y.forEach((c, i) => {
        expect(c).toBeCloseTo(axis[i] ?? 0, 9);
      });
    }
  });
});
