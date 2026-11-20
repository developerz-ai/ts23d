import { describe, expect, it } from 'bun:test';
import { boundsOf, checkMeshAttributes, MeshBuilder, merge } from './mesh.ts';

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

const tri = (): ReturnType<MeshBuilder['build']> => {
  const m = new MeshBuilder();
  const v = (p: [number, number, number]) =>
    m.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
  m.tri(v([0, 0, 0]), v([1, 0, 0]), v([0, 1, 0]));
  return m.build();
};
const skin = (bone: number) => ({
  joints: new Uint16Array([bone, 0, 0, 0, bone, 0, 0, 0, bone, 0, 0, 0]),
  weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
});

describe('checkMeshAttributes', () => {
  it('refuses joints without weights', () => {
    const m = { ...tri(), joints: skin(0).joints };
    expect(() => checkMeshAttributes(m, 'body')).toThrow('T3D_SKIN_INVALID');
  });

  it('refuses a skin with the wrong influence count', () => {
    const m = { ...tri(), joints: new Uint16Array(9), weights: new Float32Array(9) };
    expect(() => checkMeshAttributes(m, 'body')).toThrow(/3 vertices but 9 joints/);
  });

  it('refuses a morph whose length does not match the vertices', () => {
    const m = { ...tri(), morphs: [{ name: 'blink', positions: new Float32Array(6) }] };
    expect(() => checkMeshAttributes(m, 'head')).toThrow('T3D_RECIPE_INVALID');
  });

  it('refuses two morphs with one name', () => {
    const positions = new Float32Array(9);
    const m = {
      ...tri(),
      morphs: [
        { name: 'blink', positions },
        { name: 'blink', positions },
      ],
    };
    expect(() => checkMeshAttributes(m, 'head')).toThrow(/declared twice/);
  });

  it('accepts a full skin and matching morphs', () => {
    const m = { ...tri(), ...skin(2), morphs: [{ name: 'jaw', positions: new Float32Array(9) }] };
    expect(checkMeshAttributes(m, 'head')).toBe(m);
  });
});

describe('merge with skin and morphs', () => {
  it('keeps plain meshes plain (no new keys)', () => {
    expect(Object.keys(merge([tri(), tri()])).sort()).toEqual(
      ['colors', 'indices', 'normals', 'positions', 'uvs'].sort(),
    );
  });

  it('refuses a mix of skinned and unskinned meshes', () => {
    expect(() => merge([{ ...tri(), ...skin(1) }, tri()])).toThrow('T3D_SKIN_INVALID');
  });

  it('concatenates skins and fills missing morphs with zero deltas', () => {
    const delta = new Float32Array(9).fill(0.5);
    const out = merge([
      { ...tri(), ...skin(1), morphs: [{ name: 'jaw', positions: delta }] },
      { ...tri(), ...skin(3) },
    ]);
    expect([...(out.joints ?? [])].filter((_, i) => i % 4 === 0)).toEqual([1, 1, 1, 3, 3, 3]);
    expect(out.weights?.length).toBe(24);
    expect([...(out.morphs?.[0]?.positions ?? [])]).toEqual([...delta, ...new Float32Array(9)]);
    expect(checkMeshAttributes(out, 'merged')).toBe(out);
  });
});

describe('merge of very many meshes', () => {
  it('fails before D406: a million meshes merge without spreading them into a call', () => {
    const one = { ...tri(), mapped: [{ id: 'm_rock', row: 2, v0: 0.5, v1: 0.6 }] };
    const out = merge(new Array(1_000_000).fill(tri()).concat([one]));
    expect(out.positions.length).toBe(1_000_001 * 9);
    expect(out.mapped).toEqual(one.mapped);
  });
});
