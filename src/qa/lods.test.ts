import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, type Lod } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { lodPivots, lodSilhouette, lodTriangles, runLodQa } from './lods.ts';

const c: [number, number, number] = [0.5, 0.5, 0.5];
const chain = (build: Parameters<typeof defineAsset>[0]['build']) => {
  const a = defineAsset({ name: 'a', kind: 'prop', budget: { triangles: [999, 999, 999] }, build });
  return ([0, 1, 2] as Lod[]).map((lod) => compile(a, { lod }));
};

describe('lod gates', () => {
  it('flag more triangles at a far LOD, a shrinking outline and a dropped pivot', () => {
    const bad = chain((ctx) => {
      const segs = ctx.pick([8, 16, 8]);
      const h = ctx.pick([2, 2, 1]);
      ctx.part('post', cylinder({ radius: 0.2, length: h, segments: segs, color: c }), {
        at: [0, 0, h / 2],
      });
      if (ctx.lod === 0) ctx.group('lamp', { at: [0, 0, 2] });
    });
    expect(lodTriangles(bad).map((f) => f.message)).toEqual([
      'LOD1 has 64 triangles, more than LOD0 (32)',
    ]);
    expect(lodSilhouette()(bad)[0]?.message).toContain('LOD2 outline differs from LOD0 on Z');
    expect(lodPivots(bad).length).toBe(2);
  });

  it('pass a chain that only drops detail', () => {
    const ok = chain((ctx) => {
      ctx.part('crate', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 0.5] });
      ctx.group('lid', { at: [0, 0, 1] });
      if (ctx.lod === 0)
        ctx.part('bolt', box({ size: [0.05, 0.05, 0.05], color: c }), { at: [0, 0, 1.02] });
    });
    expect(runLodQa(ok, [lodTriangles, lodSilhouette(), lodPivots])).toEqual([]);
  });
});
