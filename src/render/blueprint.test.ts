import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Measure } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { blueprint, blueprintImage } from './blueprint.ts';
import { BAD, measureResults, OK, shortLabel } from './blueprint-measures.ts';

const post = (spec: number, joint = false) =>
  defineAsset({
    name: 'post',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    real: {
      length: 0.4,
      width: 0.4,
      height: 2,
      measures: [
        {
          label: 'post height (drawing 3)',
          value: spec,
          axis: 'z',
          parts: ['pole'],
        } satisfies Measure,
      ],
    },
    build(ctx) {
      ctx.part('base', box({ size: [0.4, 0.4, 0.1], color: [0.3, 0.3, 0.3] }));
      ctx.part(
        'pole',
        cylinder({
          radius: 0.05,
          length: 1.9,
          segments: 12,
          color: [0.6, 0.6, 0.6],
          at: [0, 0, 1.05],
        }),
      );
      if (joint) ctx.joint('foot', { from: 'base', to: 'pole', at: [0, 0, 0.1], axis: [0, 0, 1] });
    },
  });

const count = (px: Uint8Array, rgb: readonly number[]): number => {
  let n = 0;
  for (let i = 0; i < px.length; i += 4)
    if (px[i] === rgb[0] && px[i + 1] === rgb[1] && px[i + 2] === rgb[2]) n++;
  return n;
};

describe('blueprint', () => {
  it('draws an out-of-tolerance measure in red', () => {
    const [r] = measureResults(compile(post(1.5)));
    expect(r?.ok).toBe(false);
    expect(r?.value).toBeCloseTo(1.9, 5);
    const img = blueprintImage(compile(post(1.5)), { panel: 400 });
    expect(count(img.px, BAD)).toBeGreaterThan(50);
  });

  it('draws a measure within tolerance in green, and no red', () => {
    const img = blueprintImage(compile(post(1.9)), { panel: 400 });
    expect(count(img.px, OK)).toBeGreaterThan(50);
    expect(count(img.px, BAD)).toBe(0);
  });

  it('marks a joint that does not fit in red', () => {
    // The 0.4 m base meets a 0.1 m pole: T3D_JOINT_MISMATCH, so the marker and legend go red.
    const img = blueprintImage(compile(post(1.9, true)), { panel: 400 });
    expect(count(img.px, BAD)).toBeGreaterThan(20);
  });

  it('is a deterministic PNG', () => {
    const a = blueprint(compile(post(1.9)), { panel: 300 });
    expect([...a.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
    expect(Bun.hash(a)).toBe(Bun.hash(blueprint(compile(post(1.9)), { panel: 300 })));
  });

  it('drops a measure label’s provenance for the drawing', () => {
    expect(shortLabel('driver diameter (5 ft 4 in)')).toBe('driver diameter');
  });
});
