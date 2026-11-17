import { expect, it } from 'bun:test';
import { box, compile, defineAsset, encodePng, MeshBuilder } from '../index.ts';
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

const png = (size: number, grey: number): Uint8Array =>
  encodePng(size, size, new Uint8Array(size * size * 4).fill(grey));
const hide = { name: 'hide', albedo: png(8, 200), normal: png(4, 128), credit: 'test model, CC0' };
const quad = () => {
  const b = new MeshBuilder();
  const at = (x: number, z: number) =>
    b.vertex({ p: [x, 0, z], n: [0, -1, 0], uv: [x, 1 - z], color: [1, 1, 1] });
  return b.quad(at(0, 0), at(1, 0), at(1, 1), at(0, 1)).build();
};
const pelt = (textured: boolean) =>
  defineAsset({
    name: 'pelt',
    kind: 'prop',
    budget: { triangles: [24, 24, 24], textureSets: { count: 1, size: 1024 } },
    build(ctx) {
      ctx.part('crate', box({ size: [1, 1, 1], color: [1, 1, 1] }));
      ctx.part('skin', quad(), { at: [0, -1, 0], ...(textured ? { textures: hide } : {}) });
    },
  });

it('omits textureSets for an asset without them and keeps it at one draw', () => {
  const lod = compile(pelt(false), { lod: 0 });
  const m = manifestOf(pelt(false), [lod], { lods: [] }, []);
  expect('textureSets' in m).toBe(false);
  expect(m.drawCalls).toEqual([1]);
});

it('lists texture sets with map sizes and bytes, and counts their material as a draw', () => {
  const lods = [compile(pelt(true), { lod: 0 }), compile(pelt(true), { lod: 2 })];
  const m = manifestOf(pelt(true), lods, { lods: ['lod0.glb', 'lod2.glb'] }, []);
  expect(m.textureSets).toEqual([
    {
      name: 'hide',
      size: 8,
      maps: {
        albedo: { size: 8, bytes: hide.albedo.byteLength },
        normal: { size: 4, bytes: hide.normal.byteLength },
      },
      bytes: hide.albedo.byteLength + hide.normal.byteLength,
      credit: 'test model, CC0',
    },
  ]);
  expect(m.drawCalls).toEqual([2, 2]);
  expect(m.pivots.map((p) => p.name)).toEqual(['body', 'body_tex_hide']);
});
