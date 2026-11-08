import { describe, expect, it } from 'bun:test';
import { defineAsset, Ts23dError, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { assertLodSilhouette, assertTexelDensity, texelDensity } from './index.ts';

const grey: Vec3 = [0.5, 0.5, 0.5];

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

/** A house: body + chimney. `dropChimney` loses the chimney mass at LOD2 (wrong); detail only
 *  ever drops the door knob (right). */
const house = (dropChimney: boolean) =>
  defineAsset({
    name: 'house',
    kind: 'prop',
    budget: { triangles: [99, 99, 99] },
    build: (ctx) => {
      ctx.part('body', box({ size: [4, 4, 3], color: grey }));
      if (!(dropChimney && ctx.lod === 2))
        ctx.part('chimney', box({ size: [1, 1, 3], at: [1, 1, 3], color: grey }));
      if (ctx.lod === 0)
        ctx.part('knob', box({ size: [0.05, 0.05, 0.05], at: [2.02, 0, 1], color: grey }));
    },
  });

describe('LOD silhouette — failure case first', () => {
  it('fails when LOD2 drops a big mass, naming the view and IoU', () => {
    const r = run(() => assertLodSilhouette(house(true), 0.9));
    expect(r).toContain('T3D_QA_FAILED');
    expect(r).toMatch(/seen from \+X the outline matches LOD0 at IoU 0\.\d+ < 0\.9/);
  });

  it('passes when only small detail drops', () => {
    expect(assertLodSilhouette(house(false), 0.9)).toBeGreaterThan(0.97);
  });
});

/** A cube of edge `size` with the brick strip: the box maps one strip span per face, so a big
 *  cube smears the same texels over more metres. */
const cube = (size: number) =>
  defineAsset({
    name: 'cube',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build: (ctx) => {
      ctx.part('cube', box({ size: [size, size, size], color: grey, strip: 'brick' }));
    },
  });

describe('texel density', () => {
  it('fails a part outside the range, with its px/m', () => {
    const r = run(() => assertTexelDensity(cube(10), [200, 400]));
    expect(r).toMatch(/'cube' gets 81 px\/m, want 200–400 px\/m/);
    expect(r).toContain('stretched');
  });

  it('passes inside the range; reports per part', () => {
    expect(texelDensity(box({ size: [1, 1, 1], color: grey }))).toBeCloseTo(256, 0);
    expect(assertTexelDensity(cube(1), [200, 400])).toEqual([256]);
  });
});
