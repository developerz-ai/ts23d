import { describe, expect, it } from 'bun:test';
import { type CompiledAsset, compile, defineAsset, type Mesh, type Part } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { runQa } from './gates.ts';
import {
  degenerateTriangles,
  meshArrays,
  nonFinite,
  normalsMatchWinding,
  vertexColors,
} from './sanity.ts';

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
    for (const g of [meshArrays, nonFinite, vertexColors, normalsMatchWinding, degenerateTriangles])
      expect(g(a)).toEqual([]);
  });
});

const placed = (build: Parameters<typeof defineAsset>[0]['build']) =>
  compile(
    defineAsset({ name: 'placed', kind: 'prop', budget: { triangles: [99, 99, 99] }, build }),
  );

// The gate stands on its own: core may refuse these at compile time too, so the transforms are
// broken after compiling, the way a hand-built or transformed CompiledAsset could carry them.
const broken = (name: string, change: Partial<Part>): CompiledAsset => {
  const a = placed((ctx) => {
    ctx.part('a', box({ size: [1, 1, 1], color: c }));
    ctx.group('g', { at: [0, 0, 1] });
  });
  return { ...a, parts: a.parts.map((p) => (p.name === name ? { ...p, ...change } : p)) };
};

describe('non-finite transforms', () => {
  it('flag NaN at, NaN yaw and a mesh-less group at Infinity', () => {
    const found = (a: CompiledAsset) => nonFinite(a).map((f) => f.part);
    expect(found(broken('a', { at: [Number.NaN, 0, 0] }))).toEqual(['a']);
    expect(found(broken('a', { yaw: Number.NaN }))).toEqual(['a']);
    const group = broken('g', { at: [0, 0, Number.POSITIVE_INFINITY] });
    expect(found(group)).toEqual(['g']);
    expect(nonFinite(group)[0]?.message).toContain('transform');
  });
});

describe('mesh array lengths', () => {
  const b = box({ size: [1, 1, 1], color: c });
  it('flag short normals, uvs, colours and a partial triangle, before any gate reads them', () => {
    for (const bad of [
      { ...b, normals: b.normals.slice(0, 12) },
      { ...b, uvs: b.uvs.slice(0, b.uvs.length - 6) },
      { ...b, colors: b.colors.slice(0, b.colors.length - 6) },
      { ...b, indices: b.indices.slice(0, 34) },
    ]) {
      const [f, ...rest] = runQa(one(bad));
      expect(rest).toEqual([]);
      expect(f).toMatchObject({ gate: 'mesh-arrays', code: 'T3D_QA_MESH_ARRAYS', part: 'thing' });
    }
    expect(meshArrays(one({ ...b, normals: b.normals.slice(0, 12) }))[0]?.message).toContain(
      'normals 12 (want 72)',
    );
  });
});
