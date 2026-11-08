import { describe, expect, it } from 'bun:test';
import { defineAsset, type Mesh, merge, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import {
  assertClosed,
  assertManifold,
  assertMinThickness,
  assertNoSelfIntersection,
  assertOutward,
  assertSymmetric,
} from './index.ts';

const grey: [number, number, number] = [0.5, 0.5, 0.5];
const cube = (size: [number, number, number] = [1, 1, 1], at?: [number, number, number]): Mesh =>
  box({ size, color: grey, ...(at ? { at } : {}) });

/** The cube with triangle `t` wound the other way. */
const flipped = (m: Mesh, t = 0): Mesh => {
  const indices = new Uint32Array(m.indices);
  [indices[t * 3 + 1], indices[t * 3 + 2]] = [m.indices[t * 3 + 2] ?? 0, m.indices[t * 3 + 1] ?? 0];
  return { ...m, indices };
};

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

describe('mesh assertions — failure cases first', () => {
  it('assertClosed fails on a box with a missing face, naming the edge count', () => {
    const r = run(() => assertClosed(box({ size: [1, 1, 1], color: grey, omit: ['top'] })));
    expect(r).toContain('T3D_QA_FAILED');
    expect(r).toContain('4 open edge(s)');
    expect(r).toContain('fix:');
  });

  it('assertManifold fails on a fin (3 faces on one edge) and on a flipped neighbour', () => {
    // Two cubes sharing a face edge-for-edge: the shared face's edges carry 4 triangles.
    const twins = merge([cube(), cube([1, 1, 1], [0, 1, 0])]);
    expect(run(() => assertManifold(twins))).toContain('shared by 3+ triangles');
    expect(run(() => assertManifold(flipped(cube())))).toContain('wind the same way');
  });

  it('assertOutward fails on one flipped triangle, and on an inside-out box', () => {
    expect(run(() => assertOutward(flipped(cube())))).toContain('1 inward-facing triangle');
    const inside = cube();
    const all = new Uint32Array(inside.indices);
    for (let t = 0; t < all.length; t += 3)
      [all[t + 1], all[t + 2]] = [inside.indices[t + 2] ?? 0, inside.indices[t + 1] ?? 0];
    expect(run(() => assertOutward({ ...inside, indices: all }))).toContain(
      '12 inward-facing triangle',
    );
  });

  it('assertNoSelfIntersection fails on two boxes merged through each other', () => {
    const crossed = merge([cube([1, 0.2, 0.2], [0, 0, 0.4]), cube([0.2, 1, 0.2], [0, 0, 0.4])]);
    expect(run(() => assertNoSelfIntersection(crossed))).toContain('folds through itself');
  });

  it('assertMinThickness fails a 1 mm wall against 3 mm, with the measured value', () => {
    expect(run(() => assertMinThickness(cube([1, 0.001, 1]), 0.003))).toContain('is 1.00 mm thick');
  });

  it('assertSymmetric fails when one side has a part the other lacks', () => {
    const lopsided = defineAsset({
      name: 'lopsided',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build: (ctx) => {
        ctx.part('body', cube([2, 1, 1]));
        ctx.part('mirror_l', cube([0.2, 0.3, 0.2], [0, 0.65, 0.5]));
      },
    });
    const r = run(() => assertSymmetric(lopsided, 'y', 0.01));
    expect(r).toContain('has no mirror across y = 0');
  });

  it('a part filter that matches nothing is an input error, not a pass', () => {
    const a = defineAsset({
      name: 'one',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build: (ctx) => {
        ctx.part('body', cube());
      },
    });
    expect(run(() => assertClosed(a, { parts: 'hull' }))).toContain('T3D_ASSERT_INPUT');
  });
});

describe('mesh assertions — passing cases', () => {
  it('a plain box is closed, manifold, outward, not self-intersecting, symmetric', () => {
    const m = cube([1, 0.5, 0.8]);
    expect(run(() => assertClosed(m))).toBe('passed');
    expect(run(() => assertManifold(m))).toBe('passed');
    expect(assertOutward(m)).toBe(0);
    expect(assertNoSelfIntersection(m)).toBe(0);
    expect(assertMinThickness(m, 0.003)).toBeCloseTo(0.5, 3);
    expect(assertSymmetric(m, 'y')).toBeLessThan(1e-4);
    expect(assertSymmetric(m, 'x')).toBeLessThan(1e-4);
  });

  it('a bevelled box passes too (many faces, shared edges)', () => {
    const m = box({ size: [1, 1, 1], color: grey, bevel: 0.05 });
    expect(run(() => assertClosed(m))).toBe('passed');
    expect(run(() => assertManifold(m))).toBe('passed');
    expect(assertOutward(m)).toBe(0);
  });

  it('a 1 cm wall passes 3 mm', () => {
    expect(assertMinThickness(cube([1, 0.01, 1]), 0.003)).toBeCloseTo(0.01, 4);
  });
});
