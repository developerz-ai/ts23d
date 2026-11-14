import { expect, it } from 'bun:test';
import { box, compile, defineAsset } from '../index.ts';
import { drawCallsOf, manifestOf } from './manifest.ts';

const kiosk = defineAsset({
  name: 'kiosk',
  kind: 'prop',
  budget: { triangles: [24, 24, 24] },
  build(ctx) {
    ctx.part('body', box({ size: [1, 1, 1], color: [1, 1, 1] }));
    ctx.part('lid', box({ size: [1, 1, 0.1], at: [0, 0, 0.55], color: [1, 1, 1] }));
    ctx.socket('handle', { kind: 'interact', parent: 'lid', at: [0, 0, 0.6] });
  },
});

it('names a socket parent the GLB has (the merged pivot), never a merged-away part', () => {
  const m = manifestOf(kiosk, [compile(kiosk, { lod: 0 })], { lods: [] }, []);
  const nodes = m.pivots.map((p) => p.name);
  const parent = m.sockets[0]?.parent;
  expect(m.sockets.map((s) => s.name)).toEqual(['handle']);
  expect(parent).not.toBe('lid');
  expect(parent === null || nodes.includes(parent ?? '')).toBe(true);
});

it('lists the LODs built beside the per-LOD arrays', () => {
  const lods = [compile(kiosk, { lod: 0 }), compile(kiosk, { lod: 2 })];
  const m = manifestOf(kiosk, lods, { lods: ['lod0.glb', 'lod2.glb'] }, []);
  expect(m.lods).toEqual([0, 2]);
  expect(m.triangles).toHaveLength(2);
  expect(m.drawCalls).toEqual(lods.map(drawCallsOf));
});
