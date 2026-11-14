import { describe, expect, it } from 'bun:test';
import { boundsOf, MeshBuilder, merge } from './mesh.ts';

describe('boundsOf', () => {
  it('gives an empty mesh finite zero-size bounds at the origin', () => {
    const b = boundsOf(merge([]));
    expect([...b.min, ...b.max].every(Number.isFinite)).toBe(true);
    expect(b).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it('spans every vertex of a non-empty mesh', () => {
    const m = new MeshBuilder();
    const v = (p: [number, number, number]) =>
      m.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    m.tri(v([-1, 2, 3]), v([4, -5, 6]), v([0, 0, -7]));
    expect(boundsOf(m.build())).toEqual({ min: [-1, -5, -7], max: [4, 2, 6] });
  });
});
