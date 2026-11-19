import { describe, expect, it } from 'bun:test';
import { type Clip, compile } from '../core/index.ts';
import { BinWriter } from './bin-writer.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';
import { deltaAccessor } from './morph-targets.ts';
import { arm } from './skin-fixtures.ts';

type Acc = { count: number; bufferView?: number; sparse?: { count: number }; min?: number[] };

const twoWeights: Clip = {
  name: 'bad',
  seconds: 1,
  loop: true,
  tracks: [
    {
      part: 'body',
      path: 'weights',
      times: new Float32Array([0, 1]),
      values: new Float32Array([0, 0, 1, 1]),
    },
  ],
};

describe('morph targets in the GLB', () => {
  it('refuses a weights track whose width is not the target count', () => {
    expect(() => toGlb(compile(arm([twoWeights])), { animations: true })).toThrow(
      '2 morph weights',
    );
  });

  it('stores each target sparsely (only the vertices that move), named, at weight 0', () => {
    const { json } = readGlbChunks(toGlb(compile(arm()), { animations: true }));
    const meshes = json['meshes'] as {
      weights?: number[];
      extras?: { targetNames?: string[] };
      primitives: { targets?: { POSITION: number }[]; attributes: { POSITION: number } }[];
    }[];
    const body = meshes[0];
    expect(body?.weights).toEqual([0]);
    expect(body?.extras?.targetNames).toEqual(['bulge']);
    const accessors = json['accessors'] as Acc[];
    const target = accessors[body?.primitives[0]?.targets?.[0]?.POSITION ?? -1];
    const count = accessors[body?.primitives[0]?.attributes.POSITION ?? -1]?.count ?? 0;
    expect(target?.bufferView).toBeUndefined();
    expect(target?.count).toBe(count);
    expect(target?.sparse?.count).toBeGreaterThan(0);
    expect(target?.sparse?.count).toBeLessThan(count);
    expect(target?.min?.length).toBe(3);
    // The wheel has no morphs: no targets, no weights.
    expect(meshes[1]?.primitives[0]?.targets).toBeUndefined();
  });

  it('writes a delta densely only when asked and when that is smaller', () => {
    const bin = new BinWriter();
    const delta = new Float32Array(30).fill(0.5);
    delta.fill(0, 0, 3);
    const sparse = bin.accessors[deltaAccessor(bin, delta)] as Acc;
    expect(sparse.bufferView).toBeUndefined();
    expect(sparse.sparse?.count).toBe(9);
    const dense = bin.accessors[deltaAccessor(bin, delta, { dense: true })] as Acc;
    expect(dense.sparse).toBeUndefined();
    expect(dense.bufferView).toBeDefined();
    expect(dense.min).toEqual([0, 0, 0]);
    // One of ten vertices moves: an index and a value beat ten whole vectors.
    delta.fill(0, 6);
    const few = bin.accessors[deltaAccessor(bin, delta, { dense: true, bounds: false })] as Acc;
    expect(few.sparse?.count).toBe(1);
    expect(few.min).toBeUndefined();
  });

  it('declares min / max as the extrema of the values the accessor holds', () => {
    const bin = new BinWriter();
    const bounds = (delta: Float32Array, dense: boolean) => {
      const a = bin.accessors[deltaAccessor(bin, delta, { dense })] as Acc & { max?: number[] };
      return { sparse: a.sparse !== undefined, min: a.min, max: a.max };
    };
    // Every vertex moves by +0.5: no zero is stored, dense or sparse.
    const all = new Float32Array(30).fill(0.5);
    expect(bounds(all, true)).toEqual({
      sparse: false,
      min: [0.5, 0.5, 0.5],
      max: [0.5, 0.5, 0.5],
    });
    expect(bounds(all, false)).toEqual({
      sparse: true,
      min: [0.5, 0.5, 0.5],
      max: [0.5, 0.5, 0.5],
    });
    // A still vertex is a real zero in both: dense writes it, sparse leaves it at the base value.
    const most = new Float32Array(30).fill(-0.5);
    most.fill(0, 0, 3);
    expect(bounds(most, true)).toEqual({ sparse: false, min: [-0.5, -0.5, -0.5], max: [0, 0, 0] });
    expect(bounds(most, false)).toEqual({ sparse: true, min: [-0.5, -0.5, -0.5], max: [0, 0, 0] });
    // A moving vertex's own zero component counts too.
    const flat = new Float32Array(30);
    for (let v = 0; v < 10; v++) flat[v * 3] = 0.25;
    expect(bounds(flat, true)).toEqual({ sparse: false, min: [0.25, 0, 0], max: [0.25, 0, 0] });
  });
});
