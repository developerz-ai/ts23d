import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Mesh } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { degenerateTriangles, nonFinite, normalsMatchWinding, vertexColors } from './sanity.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const one = (mesh: Mesh) =>
  compile(
    defineAsset({
      name: 'one',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build: (ctx) => ctx.part('thing', mesh),
    }),
  );
const flipped = (m: Mesh): Mesh => {
  const indices = new Uint32Array(m.indices);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t + 1] ?? 0;
    indices[t + 1] = indices[t + 2] ?? 0;
    indices[t + 2] = a;
  }
  return { ...m, indices };
};

describe('sanity gates', () => {
  it('flag NaN positions, out-of-range colours, inside-out winding and slivers', () => {
    const b = box({ size: [1, 1, 1], color: c });
    const nan = new Float32Array(b.positions);
    nan[4] = Number.NaN;
    expect(nonFinite(one({ ...b, positions: nan })).map((f) => f.gate)).toEqual(['non-finite']);
    expect(vertexColors(one({ ...b, colors: b.colors.map(() => 1.4) }))[0]?.gate).toBe(
      'vertex-colors',
    );
    expect(normalsMatchWinding(one(flipped(b)))[0]?.message).toContain(
      '12 triangle(s) (100.0% of its area) have vertex normals opposing',
    );
    const slivers = new Uint32Array([...b.indices, 0, 0, 1, 2, 2, 3]);
    expect(degenerateTriangles(one({ ...b, indices: slivers }))[0]?.gate).toBe(
      'degenerate-triangles',
    );
  });

  it('pass a clean box', () => {
    const a = one(box({ size: [1, 1, 1], color: c }));
    for (const g of [nonFinite, vertexColors, normalsMatchWinding, degenerateTriangles])
      expect(g(a)).toEqual([]);
  });
});
