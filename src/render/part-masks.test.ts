import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { partBox, partMasks } from './part-masks.ts';
import { orthoCamera } from './raster.ts';

const pair = defineAsset({
  name: 'pair',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('base', box({ size: [1, 1, 0.5], color: [1, 1, 1] }));
    ctx.part('top', box({ size: [0.4, 0.4, 0.5], at: [0, 0, 0.5], color: [1, 1, 1] }));
  },
});

describe('partMasks', () => {
  const cam = orthoCamera({ label: 'side', dir: [0, 1, 0], up: [0, 0, 1] }, [0, 0, 0.5], 1, 100);
  const m = partMasks(compile(pair), cam, 100, 100);

  it('names the part in front per pixel; background is −1', () => {
    expect(m.parts).toEqual(['base', 'top']);
    expect(m.ids[0]).toBe(-1);
    expect(m.ids[50 * 100 + 50 + 30 * 100]).toBe(0);
    expect(m.ids[20 * 100 + 50 + 10 * 100]).toBe(1);
  });

  it('boxes a part, grown by the margin; an unknown part has none', () => {
    const b = partBox(m, 'top', 0);
    const g = partBox(m, 'top', 0.25);
    if (!b || !g) throw new Error('no box');
    expect(b[2] - b[0]).toBeLessThan(g[2] - g[0]);
    expect(b[2] - b[0] + 1).toBeCloseTo((0.4 * 100) / 1.15, -1);
    expect(partBox(m, 'nope')).toBe(null);
  });
});
