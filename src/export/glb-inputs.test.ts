// The GLB writer refuses what would make an invalid file, and writes a mesh-less LOD cleanly:
// non-finite accessor data (written as null), attribute arrays shorter than their vertex count
// (a bare RangeError before), and empty meshes/accessors/bufferViews/zero-length buffers.
import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { BinWriter } from './bin-writer.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb, toLodGlb } from './glb.ts';

const c: [number, number, number] = [0.6, 0.5, 0.4];

// The validator (compiled Dart) calls Math.random; our preload seals it (see validator.test.ts).
async function errors(glb: Uint8Array): Promise<string[]> {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    return (await validateBytes(glb, { maxIssues: 0 })).issues.messages
      .filter((m: { severity: number }) => m.severity === 0)
      .map((m: { code: string }) => m.code);
  } finally {
    Math.random = sealed;
  }
}

describe('GLB writer inputs', () => {
  it('refuses NaN or Infinity in accessor data', () => {
    const bin = new BinWriter();
    expect(() => bin.accessor(new Float32Array([0, Number.NaN, 0]), 'VEC3')).toThrow(
      /T3D_RECIPE_INVALID.*non-finite/,
    );
    expect(() => bin.accessor(new Float32Array([Number.POSITIVE_INFINITY]), 'SCALAR')).toThrow(
      /T3D_RECIPE_INVALID/,
    );
  });

  it('refuses short normals, uvs or colours with a coded error, not a RangeError', () => {
    const b = box({ size: [1, 1, 1], color: c });
    for (const mesh of [
      { ...b, normals: b.normals.slice(0, 12) },
      { ...b, uvs: b.uvs.slice(0, 10) },
      { ...b, colors: b.colors.slice(0, 9) },
      { ...b, indices: b.indices.slice(0, 34) },
    ]) {
      const a = compile(
        defineAsset({
          name: 'bad',
          kind: 'prop',
          budget: { triangles: [99, 99, 99] },
          build: (ctx) => ctx.part('a', mesh),
        }),
      );
      for (const optimize of [true, false])
        expect(() => toGlb(a, { optimize })).toThrow(/T3D_RECIPE_INVALID.*'a'.*wrong length/);
    }
  });

  it('writes a mesh-less LOD with no empty arrays and no zero-length buffer', async () => {
    const def = defineAsset({
      name: 'gated',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build(ctx) {
        ctx.group('pivot', { at: [0, 0, 1] });
        if (ctx.lod < 2) ctx.part('body_box', box({ size: [1, 1, 1], color: c }));
      },
    });
    const lods = ([0, 1, 2] as const).map((lod) => compile(def, { lod }));
    const [, , lod2] = lods;
    if (!lod2) throw new Error('three LODs');
    const glb = toGlb(lod2);
    expect(await errors(glb)).toEqual([]);
    const { json } = readGlbChunks(glb);
    for (const k of ['meshes', 'accessors', 'bufferViews', 'buffers'])
      expect(json[k]).toBeUndefined();
    expect(await errors(toLodGlb(lods))).toEqual([]);
  });
});
