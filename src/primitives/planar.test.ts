import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { planar } from './planar.ts';

const C: Vec3 = [1, 1, 1];

/** Σ of triangle area vectors: its length is the filled area, its direction the facing. */
function areaVector(m: Mesh): Vec3 {
  const out: [number, number, number] = [0, 0, 0];
  const p = (i: number): Vec3 => [
    m.positions[i * 3] ?? 0,
    m.positions[i * 3 + 1] ?? 0,
    m.positions[i * 3 + 2] ?? 0,
  ];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [p(m.indices[t] ?? 0), p(m.indices[t + 1] ?? 0), p(m.indices[t + 2] ?? 0)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
    out[0] += (u[1] * w[2] - u[2] * w[1]) / 2;
    out[1] += (u[2] * w[0] - u[0] * w[2]) / 2;
    out[2] += (u[0] * w[1] - u[1] * w[0]) / 2;
  }
  return out;
}

describe('planar input', () => {
  it('rejects fewer than 3 points, a NaN point and a loop without area', () => {
    const bad: readonly (readonly Vec3[])[] = [
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, Number.NaN, 0],
      ],
      [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [3, 0, 0],
      ],
    ];
    for (const points of bad)
      expect(() => planar({ points, color: C })).toThrow('T3D_RECIPE_INVALID');
  });
});

describe('planar facing', () => {
  it('faces the side its loop is counter-clockwise from, even when it starts at a reflex corner', () => {
    // An L, CCW seen from +Z, listed from its inner (reflex) corner.
    const points: Vec3[] = [
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 0],
      [2, 0, 0],
      [2, 2, 0],
      [1, 2, 0],
    ];
    // A 2 × 2 square less its 1 × 1 top-left corner: 3 m².
    const m = planar({ points, color: C });
    expect([m.normals[0], m.normals[1], m.normals[2]]).toEqual([0, 0, 1]);
    const a = areaVector(m);
    expect(a[2]).toBeCloseTo(3, 9);
  });

  it('fills a loop whose first three points are collinear', () => {
    const m = planar({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [2, 0, 0],
        [2, 2, 0],
        [0, 2, 0],
      ],
      color: C,
    });
    expect(areaVector(m)[2]).toBeCloseTo(4, 9);
    expect(m.normals[2]).toBe(1);
  });
});

describe('planar V', () => {
  it('never wraps inside a face: V rises with height on a face exactly one band tall', () => {
    const r = stripRect('plain');
    // 'plain' spans 4 m along U and planar scales V the same: 4 m up wrapped back to V 0.
    const m = planar({
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [1, 4, 0],
        [0, 4, 0],
      ],
      color: C,
    });
    const [low, high] = [m.uvs[1] ?? 0, m.uvs[5] ?? 0];
    expect(high).toBeGreaterThan(low);
    for (const v of [low, high]) expect(v >= r.v0 && v <= r.v1).toBe(true);
  });
});
