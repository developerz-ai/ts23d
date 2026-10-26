import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { cylinder } from '../primitives/index.ts';
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
});
