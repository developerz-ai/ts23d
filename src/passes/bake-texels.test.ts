import { describe, expect, test } from 'bun:test';
import { MeshBuilder } from '../core/index.ts';
import { uvTangents } from './bake-tangents.ts';
import { dilateTexels, walkTexels } from './bake-texels.ts';

/** One triangle over the lower-left half of UV space, flat in z = 0. */
function tri() {
  const b = new MeshBuilder();
  const v = (x: number, y: number): number =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x, y], color: [1, 1, 1] });
  b.tri(v(0, 0), v(1, 0), v(0, 1));
  return b.build();
}

describe('walkTexels', () => {
  test('covers only the triangle, once per texel, with the UV frame', () => {
    const m = tri();
    const seen = new Set<number>();
    let frame: number[] = [];
    const cov = walkTexels(m, 16, uvTangents(m), (f) => {
      expect(seen.has(f.i)).toBe(false);
      seen.add(f.i);
      frame = [...f.t, ...f.b, ...f.n];
    });
    expect(cov[15 * 16 + 15]).toBe(0);
    expect(cov[0]).toBe(1);
    expect(seen.size).toBe(cov.reduce((s, c) => s + c, 0));
    // T = +x, B toward decreasing v = −y, N = +z.
    expect(frame.map((v) => Math.round(v) + 0)).toEqual([1, 0, 0, 0, -1, 0, 0, 0, 1]);
  });
});

describe('dilateTexels', () => {
  test('grows exactly `steps` texels and leaves the rest', () => {
    const S = 8;
    const img = new Float32Array(S * S);
    const filled = new Uint8Array(S * S);
    img[0] = 5;
    filled[0] = 1;
    dilateTexels(img, 1, filled, S, 2);
    expect([img[1], img[2], img[S], img[S + 1]]).toEqual([5, 5, 5, 5]);
    expect(filled[3]).toBe(0);
    expect(img[3]).toBe(0);
  });
});
