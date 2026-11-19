import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { proportions } from './gates.ts';
import { measures } from './measures.ts';

const wheels = (d: number) =>
  defineAsset({
    name: 'axle',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    real: {
      length: 1,
      width: 1.6,
      height: 1,
      measures: [
        { label: 'wheel diameter', axis: 'z', value: 1.0, parts: ['wheel_l'] },
        { label: 'gauge', axis: 'y', value: 1.435, between: ['wheel_l', 'wheel_r'] },
      ],
    },
    build(ctx) {
      for (const [s, y] of [
        ['l', 0.7175],
        ['r', -0.7175],
      ] as const)
        ctx.part(
          `wheel_${s}`,
          cylinder({ radius: d / 2, length: 0.1, segments: 32, axis: 'y', color: [1, 1, 1] }),
          { at: [0, y, d / 2] },
        );
    },
  });

describe('measures gate', () => {
  it('passes a model built to spec', () => {
    expect(measures(compile(wheels(1.0)))).toEqual([]);
  });

  it('fails a wheel 10% oversize, naming the spec', () => {
    const f = measures(compile(wheels(1.1)));
    expect(f).toHaveLength(1);
    expect(f[0]?.message).toContain('wheel diameter');
  });

  it('fails a measure whose error is NaN (second lock behind input validation)', () => {
    const a = compile(wheels(1.0), { lod: 0 });
    const real = a.real;
    expect(real).toBeDefined();
    if (!real) return;
    const nan = {
      ...a,
      real: {
        ...real,
        measures: [
          {
            ...(real.measures?.[0] ?? { label: 'x', axis: 'z' as const, value: 1 }),
            value: Number.NaN,
          },
        ],
      },
    };
    expect(measures(nan).map((f) => f.code)).toEqual(['T3D_QA_MEASURES']);
    expect(proportions({ ...a, real: { ...real, length: Number.NaN } }).map((f) => f.code)).toEqual(
      ['T3D_QA_PROPORTIONS'],
    );
  });
});

// A 2 m drum turned 45° about Z is still 2 m across: the old gate rotated the local box's corners
// and measured 2.83 m.
const drum = (real: number) =>
  defineAsset({
    name: 'drum',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    real: { length: real, width: real, height: 1 },
    build(ctx) {
      ctx.part(
        'drum',
        cylinder({ radius: 1, length: 1, segments: 64, axis: 'z', color: [1, 1, 1] }),
        {
          yaw: Math.PI / 4,
        },
      );
    },
  });

describe('proportions gate on yawed parts', () => {
  it('fails a yawed 2 m drum declared 2.83 m, passes it declared 2 m', () => {
    expect(proportions(compile(drum(2.83))).map((f) => f.code)).toEqual([
      'T3D_QA_PROPORTIONS',
      'T3D_QA_PROPORTIONS',
    ]);
    expect(proportions(compile(drum(2)))).toEqual([]);
  });
});

// A selector that matches no part is a finding of its own, not silently dropped from the union.
const cart = (parts: readonly string[]) =>
  defineAsset({
    name: 'cart',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    real: {
      length: 0.2,
      width: 1.2,
      height: 0.2,
      measures: [{ label: 'track', parts: [...parts], axis: 'y', value: 1.2 }],
    },
    build(ctx) {
      ctx.part('wheel_l', box({ size: [0.2, 0.2, 0.2], at: [0, 0.5, 0], color: [1, 1, 1] }));
      ctx.part('wheel_r', box({ size: [0.2, 0.2, 0.2], at: [0, -0.5, 0], color: [1, 1, 1] }));
    },
  });

describe('measures gate selectors', () => {
  it("names each selector that matched nothing ('wheel_rr' typo)", () => {
    const f = measures(compile(cart(['wheel_l', 'wheel_rr'])));
    expect(f.map((x) => x.code)).toEqual(['T3D_QA_MEASURES']);
    expect(f[0]?.message).toContain("'wheel_rr'");
    expect(f[0]?.message).not.toContain("'wheel_l'");
  });

  it('passes when every selector matches', () => {
    expect(measures(compile(cart(['wheel_l', 'wheel_r'])))).toEqual([]);
  });
});
