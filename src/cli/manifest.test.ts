import { expect, it } from 'bun:test';
import {
  box,
  type Clip,
  compile,
  defineAsset,
  encodePng,
  type Lod,
  type Mesh,
  MeshBuilder,
  merge,
  place,
  toGlb,
} from '../index.ts';
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

interface Gltf {
  meshes?: { primitives: { indices: number }[] }[];
  accessors?: { count: number }[];
  animations?: { name: string }[];
}
const gltf = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len))) as Gltf;
};

it('reports the triangles in the file, and the compiled count beside it when they differ', () => {
  const sloppy = defineAsset({
    name: 'sloppy',
    kind: 'prop',
    budget: { triangles: [24, 24, 24] },
    build(ctx) {
      const b = new MeshBuilder();
      const at = (x: number, z: number) =>
        b.vertex({ p: [x, 0, z], n: [0, -1, 0], uv: [x, z], color: [1, 1, 1] });
      const [p, q, r, s] = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
      // LOD0 carries a collapsed triangle and a copy of a good one; the optimiser drops both.
      const sheet = b.quad(p, q, r, s);
      ctx.part('sheet', (ctx.lod === 0 ? sheet.tri(p, q, q).tri(p, q, r) : sheet).build());
    },
  });
  const lods = [compile(sloppy, { lod: 0 }), compile(sloppy, { lod: 2 })];
  const inFile = lods.map((l) => {
    const g = gltf(toGlb(l));
    const prims = (g.meshes ?? []).flatMap((m) => m.primitives);
    return prims.reduce((n, pr) => n + (g.accessors?.[pr.indices]?.count ?? 0), 0) / 3;
  });
  const m = manifestOf(sloppy, lods, { lods: ['lod0.glb', 'lod2.glb'] }, []);
  expect(m.triangles).toEqual(inFile);
  expect(m.triangles).toEqual([2, 2]);
  expect(m.trianglesCompiled).toEqual([4, 2]);
  // Nothing dropped: one number, no second field.
  expect(
    'trianglesCompiled' in manifestOf(kiosk, [compile(kiosk, { lod: 0 })], { lods: [] }, []),
  ).toBe(false);
});

it('lists the run clip of an asset whose only motion is a belt, as its GLB has it', () => {
  const ring = (moving: boolean) =>
    defineAsset({
      name: 'ring',
      kind: 'prop',
      budget: { triangles: [999, 999, 999] },
      build(ctx) {
        const [r, links] = [0.5, 16];
        const path = Array.from({ length: 64 }, (_, i) => {
          const a = (i / 64) * 2 * Math.PI;
          return [r * Math.cos(a), 0, r * Math.sin(a)] as const;
        });
        const pitch = (64 * 2 * r * Math.sin(Math.PI / 64)) / links;
        const link = box({ size: [pitch * 0.8, 0.3, 0.03], color: [1, 1, 1] });
        const belt = merge(
          Array.from({ length: links }, (_, k) => {
            const a = (k / links) * 2 * Math.PI;
            return place(link, {
              at: [r * Math.cos(a), 0, r * Math.sin(a)],
              pitch: -(a + Math.PI / 2),
            });
          }),
        );
        ctx.part('belt', belt, moving ? { motion: { kind: 'tread', path, pitch } } : {});
      },
    });
  const names = (moving: boolean) => {
    const lod = compile(ring(moving), { lod: 0 });
    const file = (gltf(toGlb(lod, { animations: true })).animations ?? []).map((a) => a.name);
    const listed = (manifestOf(ring(moving), [lod], { lods: [] }, []).clips ?? []).map(
      (c) => c.name,
    );
    return { file, listed };
  };
  expect(names(true).file).toEqual(['rest', 'run']);
  expect(names(true).listed).toEqual(['run']);
  expect(names(false)).toEqual({ file: [], listed: [] });
  // `--no-animations`: the GLB has no run clip, so neither does the manifest.
  const still = manifestOf(ring(true), [compile(ring(true), { lod: 0 })], { lods: [] }, [], [], {
    animations: false,
  });
  expect(still.clips).toBeUndefined();
});

const unit: [number, number, number] = [1, 1, 1];
const keys = new Float32Array([0, 1]);
const blink: Clip = {
  name: 'blink',
  seconds: 1,
  loop: true,
  tracks: [{ part: 'lid', path: 'weights', times: keys, values: new Float32Array([0, 1]) }],
};
const nod: Clip = {
  name: 'nod',
  seconds: 1,
  loop: false,
  tracks: [{ part: 'lid', path: 'translation', times: keys, values: new Float32Array(6) }],
};
/** A lid whose morph target is LOD-gated away at LOD2, keyed by a weights-only clip. */
const face = (clips: readonly Clip[]) =>
  defineAsset({
    name: 'face',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    clips,
    build(ctx) {
      ctx.part('head', box({ size: [1, 1, 1], color: unit }));
      const m = box({ size: [0.2, 0.2, 0.2], color: unit });
      const d = new Float32Array(m.positions.length);
      d[2] = 0.05;
      const lid: Mesh = ctx.lod === 2 ? m : { ...m, morphs: [{ name: 'close', positions: d }] };
      ctx.part('lid', lid, {
        at: [0, 0, 1],
        motion: { kind: 'sway', axis: [0, 1, 0], degrees: 5, hz: 1 },
      });
    },
  });
const listed = (clips: readonly Clip[], lods: readonly Lod[], animations?: boolean): string[] => {
  const built = lods.map((lod) => compile(face(clips), { lod }));
  const opts = animations === undefined ? {} : { animations };
  return (manifestOf(face(clips), built, { lods: [] }, [], [], opts).clips ?? []).map(
    (c) => c.name,
  );
};

it('lists a clip only when a requested LOD file keeps a channel of it, as the exporter does', () => {
  // The LOD2 file drops `blink` (its lid has no morph targets): the manifest must too.
  expect(listed([blink], [2])).toEqual(['run']);
  const lod2 = toGlb(compile(face([blink]), { lod: 2 }), { animations: true });
  expect((gltf(lod2).animations ?? []).map((a) => a.name)).toEqual(['rest', 'run']);
  expect(listed([blink], [0, 1, 2])).toEqual(['run', 'blink']);
  // A clip keying something the morph-less LOD still has (the lid's node) survives there.
  expect(listed([blink, nod], [2])).toEqual(['run', 'nod']);
});

it('lists no clip at all when the GLBs are written without animations', () => {
  expect(listed([blink, nod], [0, 1, 2], false)).toEqual([]);
  expect(listed([blink, nod], [0, 1, 2], true)).toEqual(['run', 'blink', 'nod']);
});
