import { describe, expect, it } from 'bun:test';
import { type Clip, compile } from '../core/index.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb } from './glb.ts';
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
});
