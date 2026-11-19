import { describe, expect, it } from 'bun:test';
import {
  type BuildContext,
  compile,
  defineAsset,
  jointFit,
  type Mesh,
  merge,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { bakeAoAsset } from './bake-ao.ts';
import { mergeGeometry } from './merge-geometry.ts';
import { bindRigid } from './skin-weights.ts';
import { weather } from './weather.ts';

const hide: [number, number, number] = [0.5, 0.4, 0.3];
const body = (): Mesh => bindRigid(box({ size: [1, 0.4, 1], color: hide }), 0);
const saddle = (): Mesh => box({ size: [0.3, 0.42, 0.1], at: [0, 0, 1], color: [0.2, 0.1, 0.1] });
const morphed = (m: Mesh): Mesh => ({
  ...m,
  morphs: [{ name: 'breathe', positions: new Float32Array(m.positions.length).fill(0.01) }],
});

/** A skinned body carrying a rigid saddle and rider: what the exporter binds on purpose. */
const horse = defineAsset({
  name: 'horse',
  kind: 'prop',
  budget: { triangles: [800, 300, 80] },
  build(ctx) {
    ctx.bone('spine', { head: [0, 0, 0.5], tail: [0.5, 0, 0.5] });
    ctx.part('body', body());
    ctx.part('body_saddle', saddle());
    ctx.part('rider', box({ size: [0.2, 0.2, 0.5], at: [0, 0, 1.1], color: hide }));
    ctx.joint('seat', { from: 'body', to: 'rider', at: [0, 0, 1.1], axis: [0, 0, 1] });
  },
});

describe('geometry-only merge of skinned + rigid meshes', () => {
  it('core merge still refuses the mix; mergeGeometry joins it without skin or morphs', () => {
    expect(() => merge([body(), saddle()])).toThrow(/only 1 are skinned/);
    const m = mergeGeometry([morphed(body()), saddle()]);
    expect(m.positions.length).toBe(body().positions.length + saddle().positions.length);
    expect(m.indices.length).toBe(body().indices.length + saddle().indices.length);
    expect(m.joints).toBeUndefined();
    expect(m.weights).toBeUndefined();
    expect(m.morphs).toBeUndefined();
  });

  it('bakeAoAsset shades a skinned body under its rigid saddle and keeps the skin', () => {
    const raw = compile(horse);
    const before = raw.parts.find((p) => p.name === 'body')?.mesh?.colors ?? new Float32Array();
    // The unbaked body already holds channels under hide[0]: only its own values prove a bake.
    expect(Math.min(...before)).toBeLessThan(hide[0]);
    const baked = bakeAoAsset(raw, { samples: 16 });
    const b = baked.parts.find((p) => p.name === 'body')?.mesh;
    expect(b?.joints).toEqual(body().joints);
    const after = b?.colors ?? new Float32Array();
    expect(after).toHaveLength(before.length);
    const change = Array.from(after, (v, i) => v - (before[i] ?? 0));
    expect(Math.max(...change)).toBeLessThanOrEqual(0);
    expect(Math.min(...change)).toBeLessThan(-0.01);
  });

  it('jointFit measures a joint between a skinned and a rigid part', () => {
    const c = compile(horse);
    const seat = c.joints?.[0];
    if (!seat) throw new Error('the fixture declares a joint');
    const fit = jointFit(c, seat);
    expect(fit.findings.every((f) => f.gate === 'joints')).toBe(true);
    // Both sides in one selector: a glob over the skinned body and its rigid saddle.
    expect(() =>
      jointFit(c, { name: 'seat', from: 'body*', to: 'rider', at: [0, 0, 1.1], axis: [0, 0, 1] }),
    ).not.toThrow();
  });

  it('weather ages the mix in one space and hands each mesh its own skin and morphs back', () => {
    const ctx = { lod: 0, seed: 1, weathered: () => {} } as unknown as BuildContext;
    const input = { body: morphed(body()), saddle: saddle() };
    const out = weather(ctx, input, { resolution: 0, effects: { dust: { amount: 0.5 } } });
    expect(out.body.joints).toEqual(input.body.joints);
    expect(out.body.weights).toEqual(input.body.weights);
    expect(out.body.morphs?.[0]?.name).toBe('breathe');
    expect(out.saddle.joints).toBeUndefined();
    expect(out.body.colors).not.toEqual(input.body.colors);
  });

  it('weather keeps a lone skinned, morphed mesh rigged through tessellation', () => {
    const m = morphed(body());
    const w = weather(m, { seed: 1, age: 0.5, effects: { rust: {} } }).mesh;
    const n = w.positions.length / 3;
    expect(n).toBeGreaterThan(m.positions.length / 3);
    expect(w.joints).toHaveLength(n * 4);
    expect(w.weights).toHaveLength(n * 4);
    expect(w.morphs?.[0]?.positions).toHaveLength(n * 3);
  });
});
