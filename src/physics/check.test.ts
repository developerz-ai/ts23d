import { describe, expect, it } from 'bun:test';
import type { CompiledAsset, Part } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import { bodyKindOf, checkPhysics, massFindings } from './check.ts';
import { boxMesh } from './fixtures.ts';
import { massProperties } from './mass.ts';

const cube: Part = {
  name: 'block',
  mesh: boxMesh([1, 1, 1], [0, 0, 0.5], 'concrete'),
  at: [0, 0, 0],
  parent: null,
  yaw: 0,
  motion: null,
};
const asset = (extra: Partial<CompiledAsset> = {}): CompiledAsset => ({
  name: 'block',
  kind: 'prop',
  lod: 0,
  budget: { triangles: [100, 100, 100] },
  real: { length: 1, width: 1, height: 1, mass: 2400 },
  checks: [],
  parts: [cube],
  ...extra,
});

describe('massFindings', () => {
  it('a 1 m³ concrete block declared as 1 t is a T3D_MASS_MISMATCH', () => {
    const a = asset({ real: { length: 1, width: 1, height: 1, mass: 1000 } });
    const f = massFindings(a, massProperties(a));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('T3D_MASS_MISMATCH');
    expect(f[0]?.fix).toContain('shell');
  });

  it('a physics.mass override cannot hide the mismatch', () => {
    const a = asset({
      real: { length: 1, width: 1, height: 1, mass: 1000 },
      physics: { mass: 1000 },
    });
    expect(massFindings(a, massProperties(a))).toHaveLength(1);
  });

  it('passes inside the tolerance, and without a declared mass', () => {
    const a = asset();
    expect(massFindings(a, massProperties(a))).toEqual([]);
    const b = asset({ real: { length: 1, width: 1, height: 1 } });
    expect(massFindings(b, massProperties(b))).toEqual([]);
  });
});

describe('checkPhysics / bodyKindOf', () => {
  it('rejects a negative density with a fix', () => {
    const a = asset({ parts: [{ ...cube, density: -1 }] });
    expect(() => checkPhysics(a)).toThrow(Ts23dError);
    expect(() => checkPhysics(asset({ physics: { shell: 0 } }))).toThrow('T3D_PHYSICS_INVALID');
    expect(() => checkPhysics(asset())).not.toThrow();
  });

  it('buildings are static, props dynamic, the recipe decides over both', () => {
    expect(bodyKindOf(asset({ kind: 'building' }))).toBe('static');
    expect(bodyKindOf(asset())).toBe('dynamic');
    expect(bodyKindOf(asset({ kind: 'building', physics: { body: 'kinematic' } }))).toBe(
      'kinematic',
    );
  });
});
