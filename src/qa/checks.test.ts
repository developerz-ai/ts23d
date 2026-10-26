import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { clear, noOverlap, symmetric, touches } from './checks.ts';
import { runQa } from './gates.ts';
import { inspect } from './inspect.ts';

const c: [number, number, number] = [1, 1, 1];
const tank = (trackZ: number) =>
  defineAsset({
    name: 'tank',
    kind: 'vehicle',
    budget: { triangles: [999, 999, 999] },
    checks: [clear('track_*', 'hull'), symmetric('_l', '_r'), touches('turret', 'hull')],
    build(ctx) {
      ctx.part('hull', box({ size: [4, 2, 1], at: [0, 0, 0.5], color: c }));
      ctx.part('turret', box({ size: [1.5, 1.5, 0.6], at: [0, 0, 1.5], color: c }));
      for (const [s, y] of [
        ['l', 1.3],
        ['r', -1.3],
      ] as const)
        ctx.part(`track_${s}`, box({ size: [4.2, 0.5, 0.2], at: [0, y, 0], color: c }));
      ctx.part('track_top_l', box({ size: [4, 0.5, 0.1], at: [0, 1.3, trackZ], color: c }));
      ctx.part('track_top_r', box({ size: [4, 0.5, 0.1], at: [0, -1.3, trackZ], color: c }));
    },
  });

describe('inspect', () => {
  it('measures distance and penetration between selected parts', () => {
    const q = inspect(compile(tank(1.0)));
    expect(q.parts('track_*').sort()).toEqual(['track_l', 'track_r', 'track_top_l', 'track_top_r']);
    expect(q.distance('turret', 'hull')).toBeLessThan(0.01);
  });
});

describe('recipe checks', () => {
  it('pass when the track clears the hull', () => {
    expect(runQa(compile(tank(1.0))).filter((f) => f.gate === 'check')).toEqual([]);
  });

  it('catch a track run sunk into the frame', () => {
    const hull = defineAsset({
      name: 'sunk',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      checks: [clear('track_*', 'hull')],
      build(ctx) {
        ctx.part('hull', box({ size: [4, 2, 1], at: [0, 0, 0.5], color: c }));
        ctx.part('track_l', box({ size: [4, 0.5, 0.2], at: [0, 0.8, 0.7], color: c }));
      },
    });
    const f = runQa(compile(hull)).filter((x) => x.gate === 'check');
    expect(f[0]?.message).toContain("'track_l' sinks");
  });

  it('noOverlap flags interpenetrating siblings', () => {
    const a = defineAsset({
      name: 'wheels',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.part('wheel_0', box({ size: [1, 1, 1], color: c }));
        ctx.part('wheel_1', box({ size: [1, 1, 1], at: [0.5, 0, 0], color: c }));
      },
    });
    expect(noOverlap('wheel_*')(compile(a)).length).toBeGreaterThan(0);
  });
});

describe('symmetric side tokens', () => {
  it('pairs whole _l/_r segments and ignores names that merely contain them', () => {
    const a = defineAsset({
      name: 'loco',
      kind: 'vehicle',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        ctx.part('axle_lead', box({ size: [0.2, 2, 0.2], color: c }));
        ctx.part('rod_l', box({ size: [1, 0.1, 0.1], at: [0, 1, 0.5], color: c }));
        ctx.part('rod_r', box({ size: [1, 0.1, 0.1], at: [0, -1, 0.5], color: c }));
      },
    });
    expect(symmetric('_l', '_r')(compile(a))).toEqual([]);
  });
});
