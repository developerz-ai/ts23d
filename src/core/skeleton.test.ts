import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import type { BuildContext } from './definition.ts';
import {
  type Bone,
  boneOf,
  checkBoneBudget,
  checkSkeleton,
  DEFAULT_BONE_BUDGET,
  useBone,
} from './skeleton.ts';

const bone = (name: string, parent?: string): Bone => ({
  name,
  ...(parent ? { parent } : {}),
  head: [0, 0, 1],
  tail: [0, 0, 1.5],
});

describe('checkSkeleton', () => {
  it('refuses a duplicate bone', () => {
    expect(() => checkSkeleton('wolf', { bones: [bone('spine'), bone('spine')] })).toThrow(
      /T3D_RECIPE_INVALID: bone 'spine' in 'wolf': declared twice/,
    );
  });

  it('refuses a parent that is not in the skeleton', () => {
    expect(() => checkSkeleton('wolf', { bones: [bone('neck', 'spine')] })).toThrow(
      /parents to 'spine', which is not in the skeleton/,
    );
  });

  it('refuses a cycle', () => {
    const bones = [bone('a', 'c'), bone('b', 'a'), bone('c', 'b')];
    expect(() => checkSkeleton('loop', { bones })).toThrow(/loops back/);
  });

  it('accepts bones in any order and round-trips them', () => {
    const s = { bones: [bone('neck', 'spine'), bone('spine'), bone('head', 'neck')] };
    expect(checkSkeleton('wolf', s)).toBe(s);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('boneOf', () => {
  it('refuses a zero-length bone', () => {
    expect(() => boneOf('a', 'jaw', { head: [0, 0, 1], tail: [0, 0, 1] })).toThrow(/coincide/);
  });

  it('refuses a limit that excludes the rest pose', () => {
    const limit = { axis: [0, 1, 0] as const, min: 10, max: 140 };
    expect(() => boneOf('a', 'knee', { head: [0, 0, 0.5], tail: [0, 0, 0], limit })).toThrow(
      /does not contain the rest pose/,
    );
  });

  it('refuses a non snake_case name', () => {
    expect(() => boneOf('a', 'Thigh', { head: [0, 0, 1], tail: [0, 0, 0] })).toThrow(/snake_case/);
  });

  it('keeps a valid limit', () => {
    const limit = { axis: [0, 1, 0] as const, min: 0, max: 140, twist: 10 };
    expect(boneOf('a', 'knee', { head: [0, 0, 0.5], tail: [0, 0, 0], limit }).limit).toEqual(limit);
  });
});

describe('checkBoneBudget', () => {
  it('fails above the default cap with the cap named', () => {
    expect(() => checkBoneBudget('wolf', DEFAULT_BONE_BUDGET + 1)).toThrow(
      /T3D_SKIN_INVALID: 'wolf' has 65 bones, over its cap of 64/,
    );
  });

  it('refuses a non-integer cap', () => {
    expect(() => checkBoneBudget('wolf', 3, 0.5)).toThrow('T3D_RECIPE_INVALID');
  });

  it('passes at the cap', () => {
    expect(() => checkBoneBudget('wolf', 12, 12)).not.toThrow();
  });
});

describe('useBone', () => {
  it('prefixes names and moves the bone by the instance transform', () => {
    const b = { ...bone('neck', 'spine'), limit: { axis: [1, 0, 0] as const, min: -10, max: 10 } };
    const out = useBone(b, 'rider', { origin: [2, 0, 0], yaw: Math.PI / 2 });
    expect(out.name).toBe('rider_neck');
    expect(out.parent).toBe('rider_spine');
    expect(out.head).toEqual([2, 0, 1]);
    expect(out.limit?.axis[1]).toBeCloseTo(1);
  });
});

const rigged = (name: string, build: (ctx: BuildContext) => void, bones?: number) =>
  defineAsset({
    name,
    kind: 'creature',
    budget: { triangles: [10, 10, 10], ...(bones ? { bones } : {}) },
    build,
  });

describe('ctx.bone', () => {
  it('refuses a duplicate bone', () => {
    const a = rigged('dup', (ctx) => {
      ctx.bone('spine', { head: [0, 0, 1], tail: [0.5, 0, 1] });
      ctx.bone('spine', { head: [0, 0, 1], tail: [0.5, 0, 1] });
    });
    expect(() => compile(a)).toThrow(/T3D_RECIPE_INVALID: bone 'spine' was declared twice/);
  });

  it('refuses a parent not declared yet', () => {
    const a = rigged('early', (ctx) => {
      ctx.bone('neck', { parent: 'spine', head: [0.5, 0, 1], tail: [0.7, 0, 1.2] });
    });
    expect(() => compile(a)).toThrow(/parents to 'spine', which does not exist yet/);
  });

  it('enforces budget.bones', () => {
    const a = rigged(
      'cap',
      (ctx) => {
        ctx.bone('a', { head: [0, 0, 1], tail: [0.5, 0, 1] });
        ctx.bone('b', { parent: 'a', head: [0.5, 0, 1], tail: [1, 0, 1] });
      },
      1,
    );
    expect(() => compile(a)).toThrow('T3D_SKIN_INVALID');
  });

  it('collects the skeleton, and a used child brings its bones prefixed', () => {
    const leg = rigged('leg', (ctx) => {
      const thigh = ctx.bone('thigh', { head: [0, 0, 1], tail: [0, 0, 0.5] });
      ctx.bone('shin', { parent: thigh, head: [0, 0, 0.5], tail: [0, 0, 0] });
    });
    const out = compile(
      rigged('pair', (ctx) => {
        ctx.bone('pelvis', { head: [0, 0, 1], tail: [0, 0, 1.2] });
        ctx.use(leg, { prefix: 'leg_l', at: [0, 0.2, 0] });
      }),
    );
    expect(out.skeleton?.bones.map((b) => b.name)).toEqual(['pelvis', 'leg_l_thigh', 'leg_l_shin']);
    expect(out.skeleton?.bones[2]).toEqual({
      name: 'leg_l_shin',
      parent: 'leg_l_thigh',
      head: [0, 0.2, 0.5],
      tail: [0, 0.2, 0],
    });
  });

  it('leaves an asset without bones unchanged (no skeleton key)', () => {
    const out = compile(rigged('plain', (ctx) => ctx.group('root')));
    expect('skeleton' in out).toBe(false);
    expect('clips' in out).toBe(false);
  });
});
