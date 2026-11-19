// Textured parts in the GLB (ADR 016): what is refused or warned first, then one material per
// set on every LOD, images stored once, tangents / vertex colour only where they mean something,
// a skinned textured body, and Khronos-valid, byte-identical files.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset, type Lod, Ts23dError } from '../core/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { exportGlb, exportLodGlb, toGlb } from './glb.ts';
import { albedo, beast, checkerPng, hide, normal, plate } from './texture-fixtures.ts';

type Json = Record<string, unknown>;
interface Prim {
  attributes: Record<string, number>;
  material: number;
}
interface Gltf {
  nodes: { name: string; mesh?: number; skin?: number; children?: number[] }[];
  meshes: { name: string; primitives: Prim[] }[];
  materials: (Json & { name: string; pbrMetallicRoughness: Json })[];
  images?: { name: string; bufferView: number; mimeType: string }[];
  textures?: { sampler: number; source: number }[];
  samplers?: Json[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  extras: { ts23d?: { textureSets?: Json[] } };
  extensions?: { KHR_xmp_json_ld?: { packets: Json[] } };
}
const json = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};
const lods = (o?: Parameters<typeof beast>[0]) =>
  ([0, 1, 2] as Lod[]).map((lod) => compile(beast(o), { lod }));
const prim = (g: Gltf, mesh: string): Prim | undefined =>
  g.meshes.find((m) => m.name === mesh)?.primitives[0];
const thrown = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.message}|${e.fix}`;
    throw e;
  }
  return 'none';
};
// A skinned mesh node sits under the Z-up root on purpose (skin.ts), as in skin.test.ts.
const BY_DESIGN = new Set(['NODE_SKINNED_MESH_NON_ROOT', 'NODE_SKINNED_MESH_LOCAL_TRANSFORMS']);
// The validator (compiled Dart) calls Math.random; ours is sealed (see validator.test.ts).
async function problems(glb: Uint8Array): Promise<string[]> {
  const sealed = Math.random;
  Math.random = () => 0.5;
  try {
    const report = await validateBytes(glb);
    return report.issues.messages
      .filter((m: { severity: number; code: string }) => m.severity <= 1 && !BY_DESIGN.has(m.code))
      .map((m: { code: string; pointer?: string }) => `${m.code} ${m.pointer ?? ''}`);
  } finally {
    Math.random = sealed;
  }
}

describe('textured parts: refused and warned', () => {
  it('refuses a normal map on a part with no UV layout, naming the part and the fix', () => {
    const flat = defineAsset({
      name: 'flat',
      kind: 'prop',
      budget: { triangles: [99, 99, 99], textureSets: { count: 1, size: 1024 } },
      build(ctx) {
        ctx.part('slab', plate(2, [1, 1, 1], 0), { textures: hide });
      },
    });
    expect(thrown(() => toGlb(compile(flat)))).toMatch(
      /^T3D_TEXTURE_INVALID\|.*part 'slab'.*no UV layout.*\|.*UVs the map was baked on/,
    );
    // Without the normal map the same part exports: nothing needs a tangent frame.
    const plain = { name: 'hide', albedo };
    expect(thrown(() => toGlb(compile(beast({ set: plain, uvScale: 0 }))))).toBe('none');
  });

  it('warns when UVs leave the atlas by more than a texel, and is silent inside it', () => {
    const out = exportGlb(compile(beast({ uvScale: 2 })));
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings?.[0]?.code).toBe('T3D_TEXTURE_INVALID');
    expect(out.warnings?.[0]?.message).toContain("part 'skin'");
    expect(out.warnings?.[0]?.fix).toContain('0..1');
    expect(exportGlb(compile(beast())).warnings).toBeUndefined();
    expect(exportLodGlb(lods({ uvScale: 2 })).warnings).toHaveLength(3);
  });

  it('refuses one set name with other bytes on another LOD', () => {
    const other = { ...hide, albedo: checkerPng(8, [0, 0, 255], [0, 0, 0]) };
    expect(thrown(() => exportLodGlb(lods({ lod2Set: other })))).toMatch(
      /^T3D_TEXTURE_INVALID\|.*LOD2 uses texture set 'hide'.*\|.*hide_lod2/,
    );
  });
});

describe('textured parts: materials', () => {
  const g = json(toGlb(compile(beast())));

  it('gives the set its own material and leaves the trim-sheet part on material 0', () => {
    expect(g.materials.map((m) => m.name)).toEqual(['ts23d_trim', 'ts23d_tex_hide']);
    expect(g.meshes.map((m) => m.name)).toEqual(['body', 'body_tex_hide']);
    expect(prim(g, 'body')?.material).toBe(0);
    expect(prim(g, 'body_tex_hide')?.material).toBe(1);
    const m = g.materials[1];
    expect(m?.pbrMetallicRoughness).toEqual({
      baseColorTexture: { index: 0 },
      metallicFactor: 1,
      roughnessFactor: 1,
      metallicRoughnessTexture: { index: 2 },
    });
    expect(m?.['normalTexture']).toEqual({ index: 1 });
    expect(m?.['occlusionTexture']).toEqual({ index: 2 });
    // CLAMP_TO_EDGE on both axes, as the renderers sample a set: a unique unwrap never tiles, and
    // REPEAT would filter the opposite edge's texels into every island that touches the border.
    expect(g.samplers).toEqual([{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]);
  });

  it('embeds each map once, as the PNG bytes it was given', () => {
    const glb = toGlb(compile(beast()));
    expect(g.images?.map((i) => i.name)).toEqual(['hide_albedo', 'hide_normal', 'hide_orm']);
    const view = g.bufferViews[g.images?.[0]?.bufferView ?? -1];
    const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
    const at = 20 + len + 8 + (view?.byteOffset ?? 0);
    expect(view?.byteLength).toBe(albedo.byteLength);
    expect(Bun.hash(glb.subarray(at, at + albedo.byteLength))).toBe(Bun.hash(albedo));
    // The same bytes under two set names are still one image.
    const twin = { name: 'hide_b', albedo: albedo.slice(), normal };
    const two = defineAsset({
      name: 'two',
      kind: 'prop',
      budget: { triangles: [99, 99, 99], textureSets: { count: 2, size: 1024 } },
      build(ctx) {
        ctx.part('a', plate(1), { textures: hide });
        ctx.part('b', plate(1), { textures: twin, at: [2, 0, 0] });
      },
    });
    const t = json(toGlb(compile(two)));
    expect(t.images).toHaveLength(3);
    expect(t.materials.map((m) => m.name)).toEqual([
      'ts23d_trim',
      'ts23d_tex_hide',
      'ts23d_tex_hide_b',
    ]);
    expect(t.meshes.map((m) => m.name)).toEqual(['body_tex_hide', 'body_tex_hide_b']);
  });

  it('uses factors without an ORM map, and MASK for a cutout part', () => {
    const fur = {
      name: 'fur',
      albedo: checkerPng(8, [90, 60, 30], [0, 0, 0], 4, 0),
      roughness: 0.6,
    };
    const cards = defineAsset({
      name: 'cards',
      kind: 'prop',
      budget: { triangles: [99, 99, 99], textureSets: { count: 1, size: 1024 } },
      build(ctx) {
        ctx.part('pelt', plate(1), { textures: fur });
        ctx.part('tuft', plate(1), { textures: fur, surface: 'cutout', at: [0, -0.1, 0] });
      },
    });
    const c = json(toGlb(compile(cards)));
    expect(c.materials.map((m) => m.name)).toEqual([
      'ts23d_trim',
      'ts23d_tex_fur',
      'ts23d_texcut_fur',
    ]);
    expect(c.materials[1]?.pbrMetallicRoughness).toEqual({
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 0.6,
    });
    expect(c.materials[2]?.['alphaMode']).toBe('MASK');
    expect(c.images).toHaveLength(1);
    // One opaque set and no trim geometry: the pivot itself carries the set.
    expect(c.meshes.map((m) => m.name)).toEqual(['body', 'body_cutout_tex_fur']);
    expect(prim(c, 'body')?.material).toBe(1);
    expect(prim(c, 'body_cutout_tex_fur')?.material).toBe(2);
    expect(prim(c, 'body')?.attributes['TANGENT']).toBeUndefined();
  });

  it('writes TANGENT for the normal map, and COLOR_0 only when a vertex is not white', () => {
    const own = prim(g, 'body_tex_hide')?.attributes ?? {};
    expect(own['TANGENT']).toBeDefined();
    expect(own['TEXCOORD_0']).toBeDefined();
    expect(own['COLOR_0']).toBeUndefined();
    // The trim-sheet part keeps its vertex colour and, with no sheet bound, no tangents.
    expect(prim(g, 'body')?.attributes['COLOR_0']).toBeDefined();
    expect(prim(g, 'body')?.attributes['TANGENT']).toBeUndefined();
    const tinted = json(toGlb(compile(beast({ tint: [1, 0.5, 0.5] }))));
    expect(prim(tinted, 'body_tex_hide')?.attributes['COLOR_0']).toBeDefined();
  });

  it('keeps the sheet on texture 0..2 and puts the sets after it', () => {
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    const s = json(toGlb(compile(beast()), { sheet }));
    expect(s.images?.map((i) => i.name).slice(3)).toEqual([
      'hide_albedo',
      'hide_normal',
      'hide_orm',
    ]);
    expect(s.textures?.slice(3)).toEqual([3, 4, 5].map((source) => ({ sampler: 1, source })));
    expect(s.samplers).toHaveLength(2);
    expect(s.materials[0]?.pbrMetallicRoughness['baseColorTexture']).toEqual({ index: 0 });
    expect(s.materials[1]?.pbrMetallicRoughness['baseColorTexture']).toEqual({ index: 3 });
    const tail = s.bufferViews.slice(-6);
    for (let i = 1; i < tail.length; i++)
      expect(tail[i]?.byteOffset).toBeGreaterThanOrEqual(
        (tail[i - 1]?.byteOffset ?? 0) + (tail[i - 1]?.byteLength ?? 0),
      );
  });

  it('declares the sets in extras and credits them in the XMP packet', () => {
    expect(g.extras.ts23d?.textureSets).toEqual([
      {
        name: 'hide',
        size: 8,
        maps: { albedo: 8, normal: 8, orm: 8 },
        materials: ['ts23d_tex_hide'],
        credit: 'test model, CC0',
      },
    ]);
    const packet = g.extensions?.KHR_xmp_json_ld?.packets[0];
    expect(packet?.['dc:contributor']).toEqual({ '@set': ['test model, CC0'] });
    // No texture sets: no `ts23d` key, the file is what it was before ADR 016.
    const bare = defineAsset({
      name: 'bare',
      kind: 'prop',
      budget: { triangles: [99, 99, 99] },
      build: (ctx) => ctx.part('a', plate(1)),
    });
    expect(json(toGlb(compile(bare))).extras.ts23d).toBeUndefined();
    expect(json(toGlb(compile(bare))).images).toBeUndefined();
  });
});

describe('textured parts: skin and LODs', () => {
  it('keeps JOINTS_0 / WEIGHTS_0 and the skin on a textured skinned part', () => {
    const g = json(toGlb(compile(beast())));
    const own = prim(g, 'body_tex_hide');
    expect(own?.attributes['JOINTS_0']).toBeDefined();
    expect(own?.attributes['WEIGHTS_0']).toBeDefined();
    expect(own?.material).toBe(1);
    expect(g.nodes.find((n) => n.name === 'body_tex_hide')?.skin).toBe(0);
    // The trim-sheet crate is another draw of the same body: it rides its nearest bone.
    expect(prim(g, 'body')?.attributes['JOINTS_0']).toBeDefined();
    expect(g.nodes.find((n) => n.name === 'body')?.skin).toBe(0);
  });

  it('shares the materials and images across the LOD trees of a single file', () => {
    const g = json(exportLodGlb(lods()).glb);
    const textured = g.meshes.filter((m) => m.name === 'body_tex_hide');
    expect(textured).toHaveLength(3);
    expect(textured.map((m) => m.primitives[0]?.material)).toEqual([1, 1, 1]);
    expect(textured.every((m) => m.primitives[0]?.attributes['TANGENT'] !== undefined)).toBe(true);
    expect(g.materials).toHaveLength(2);
    expect(g.images).toHaveLength(3);
    expect(g.textures).toHaveLength(3);
  });

  it('embeds the maps in every split-LOD file', () => {
    for (const lod of lods()) {
      const g = json(toGlb(lod));
      expect(g.images).toHaveLength(3);
      expect(prim(g, 'body_tex_hide')?.material).toBe(1);
    }
  });

  it('is Khronos-valid, split and single file, with and without the sheet', async () => {
    const sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
    expect(await problems(exportLodGlb(lods(), { animations: true }).glb)).toEqual([]);
    expect(await problems(exportLodGlb(lods(), { sheet }).glb)).toEqual([]);
    for (const lod of lods()) expect(await problems(toGlb(lod))).toEqual([]);
  });

  it('is byte-deterministic', () => {
    expect(Bun.hash(exportLodGlb(lods()).glb)).toBe(Bun.hash(exportLodGlb(lods()).glb));
    expect(Bun.hash(toGlb(compile(beast())))).toBe(Bun.hash(toGlb(compile(beast()))));
  });
});
