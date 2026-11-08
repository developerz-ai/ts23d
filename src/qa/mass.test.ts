import { describe, expect, it } from 'bun:test';
import { box, compile, defineAsset } from '../index.ts';
import { mass } from './mass.ts';

const cube = (realMass?: number) =>
  defineAsset({
    name: 'iron_cube',
    kind: 'prop',
    budget: { triangles: [12, 12, 12] },
    ...(realMass !== undefined ? { real: { length: 1, width: 1, height: 1, mass: realMass } } : {}),
    build: (ctx) =>
      ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1], strip: 'iron_cast' })),
  });

describe('mass gate', () => {
  it('fails when the geometry weighs far from real.mass', () => {
    const f = mass(compile(cube(1000), { lod: 0 }));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('T3D_MASS_MISMATCH');
  });

  it('is silent without a declared mass, or off LOD0', () => {
    expect(mass(compile(cube(), { lod: 0 }))).toEqual([]);
    expect(mass(compile(cube(1000), { lod: 1 }))).toEqual([]);
  });
});
