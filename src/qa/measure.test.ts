import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, section } from '../core/index.ts';
import { box, cylinder, lathe } from '../primitives/index.ts';
import { ruler } from './measure.ts';

const C: [number, number, number] = [1, 1, 1];
const pair = defineAsset({
  name: 'pair',
  kind: 'prop',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    ctx.part('base_block', box({ size: [2, 1, 0.5], color: C }));
    ctx.part('post', cylinder({ radius: 0.1, length: 1, segments: 32, color: C, at: [0, 0, 1.0] }));
    ctx.part('lamp', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 1.8], color: C }));
  },
});

describe('ruler', () => {
  const r = ruler(compile(pair));

  it('returns null for a selector that matches nothing', () => {
    expect(r.bounds('nope')).toBeNull();
    expect(r.between('nope', 'lamp')).toBeNull();
    expect(r.gap('lamp', 'nope')).toBeNull();
  });

  it('measures overall size and a part by prefix', () => {
    const s = r.size();
    expect(s?.length).toBeCloseTo(2, 5);
    expect(s?.height).toBeCloseTo(2, 5);
    expect(r.size('base')?.width).toBeCloseTo(1, 5);
  });

  it('measures centre and closest distance, and the gap', () => {
    expect(r.between('post', 'lamp')).toBeCloseTo(0.9, 5);
    expect(r.between('post', 'lamp', 'closest')).toBeCloseTo(0.3, 2);
    expect(r.gap('base_block', 'post')).toBeCloseTo(0, 3);
    expect(r.gap('base_block', 'lamp', 0.5)).toBe(0.5);
  });

  it('cuts a section: width, depth, area and centroid', () => {
    const s = r.section('post', { at: [0, 0, 1], normal: [0, 0, 1] });
    expect(s?.width).toBeCloseTo(0.2, 2);
    expect(s?.area).toBeCloseTo(Math.PI * 0.01, 3);
    expect(s?.centroid[2]).toBeCloseTo(1, 6);
    expect(r.section('lamp', { at: [0, 0, 1], normal: [0, 0, 1] })).toBeNull();
  });
});

describe('section', () => {
  it('subtracts holes: a tube cuts to its ring', () => {
    const tube = lathe({
      profile: [
        [0.5, 0],
        [1, 0],
        [1, 1],
        [0.5, 1],
        [0.5, 0],
      ],
      segments: 64,
      color: C,
    });
    const s = section(tube, { at: [0, 0, 0.5], normal: [0, 0, 1] });
    expect(s?.area).toBeCloseTo(Math.PI * (1 - 0.25), 1);
    expect(s?.width).toBeCloseTo(2, 2);
  });
});
