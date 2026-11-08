// PBR extensions in the GLB: lacquered paint → clearcoat, finishes → sheen/anisotropy/iridescence/
// specular, ice/liquid/jelly/optics → transmission + ior + volume. Never required; assets that
// use none of it keep their exact materials and extension list.

import { describe, expect, it } from 'bun:test';
import { type AssetDefinition, compile, defineAsset, OPTICS, srgbToLinear } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb, toLodGlb } from './glb.ts';
import { materialsFor } from './materials.ts';
import { opticsMaterial } from './pbr.ts';

type Gltf = {
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  materials: { name: string; extensions?: Record<string, Record<string, unknown>> }[];
  nodes: { name: string; mesh?: number }[];
  meshes: { primitives: { material: number }[] }[];
};
const jsonOf = (glb: Uint8Array): Gltf => {
  const dv = new DataView(glb.buffer, glb.byteOffset);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
};

const c: [number, number, number] = [0.6, 0.6, 0.6];
const red = srgbToLinear('#b01818');
const NEW = [
  'KHR_materials_anisotropy',
  'KHR_materials_clearcoat',
  'KHR_materials_iridescence',
  'KHR_materials_sheen',
  'KHR_materials_specular',
];
const make = (extra: Partial<AssetDefinition>, finish = true) =>
  defineAsset({
    name: 'pbr',
    kind: 'prop',
    budget: { triangles: [999, 999, 999] },
    build(ctx) {
      ctx.part('body', box({ size: [2, 1, 0.5], at: [0, 0, 0.25], color: red }), { paint: 'body' });
      ctx.part('seat', box({ size: [0.5, 0.5, 0.2], at: [0, 0, 0.6], color: c }), {
        ...(finish ? { finish: 'velvet' } : {}),
      });
      ctx.part('trim', box({ size: [0.1, 1, 0.1], at: [1, 0, 0.6], color: c }), {
        ...(finish ? { finish: 'brushed' } : {}),
      });
      ctx.part('ice', box({ size: [0.2, 0.2, 0.2], at: [-0.5, 0, 0.6], color: c }), {
        surface: 'ice',
      });
      ctx.part('win', box({ size: [0.05, 0.6, 0.3], at: [0.9, 0, 0.7], color: c }), {
        surface: 'glass',
      });
    },
    ...extra,
  });
const full = make({
  paint: { body: { colour: '#b01818', clearcoat: 1, clearcoatRoughness: 0.04 } },
  variants: { blue: { body: '#1830b0' } },
  finishes: {
    velvet: { sheen: { colour: '#c04060', roughness: 0.6 } },
    brushed: {
      metallic: 1,
      roughness: 0.35,
      anisotropy: { strength: 0.8, rotation: 0 },
      iridescence: { thickness: [200, 500] },
      specular: { factor: 0.9, colour: '#ffffff' },
    },
    unused: { clearcoat: 0.5 },
  },
  optics: { glass: { ior: 1.52, thickness: 0.004 } },
});
const byName = (g: Gltf, n: string) => g.materials.find((m) => m.name === n);

describe('PBR extensions: failure cases first', () => {
  it('an asset using none of it gains no extension and keeps its materials', () => {
    const plain = jsonOf(
      toGlb(compile(make({ paint: { body: '#b01818' }, finishes: { velvet: {}, brushed: {} } }))),
    );
    for (const e of NEW) expect(plain.extensionsUsed ?? []).not.toContain(e);
    expect(plain.extensionsRequired).toBeUndefined();
    expect(byName(plain, 'ts23d_paint_body')?.extensions).toBeUndefined();
  });
  it('declared finishes no part uses write nothing (bytes equal the undeclared asset)', () => {
    const a = make({ paint: { body: '#b01818' } }, false);
    const b = make({ paint: { body: '#b01818' }, finishes: { velvet: { clearcoat: 1 } } }, false);
    expect(toGlb(compile(b))).toEqual(toGlb(compile(a)));
  });
  it('the glass/translucent presets are exactly the shipped materials', () => {
    const shipped = materialsFor(new Set(['glass', 'translucent'])).materials;
    expect(JSON.stringify(shipped[1])).toBe(JSON.stringify(opticsMaterial('glass', OPTICS.glass)));
    expect(JSON.stringify(shipped[2])).toBe(
      JSON.stringify(opticsMaterial('translucent', OPTICS.translucent)),
    );
  });
});

describe('PBR extensions in the GLB', () => {
  const g = jsonOf(toGlb(compile(full)));
  it('lists every extension used and requires none', () => {
    for (const e of NEW) expect(g.extensionsUsed).toContain(e);
    expect(g.extensionsUsed).toContain('KHR_materials_volume');
    expect(g.extensionsRequired).toBeUndefined();
  });
  it('lacquered paint: clearcoat on the slot and on every livery', () => {
    const cc = { clearcoatFactor: 1, clearcoatRoughnessFactor: 0.04 };
    expect(byName(g, 'ts23d_paint_body')?.extensions?.['KHR_materials_clearcoat']).toEqual(cc);
    expect(byName(g, 'ts23d_paint_body_blue')?.extensions?.['KHR_materials_clearcoat']).toEqual(cc);
  });
  it('finishes: one material per USED finish, on merged `_finish_` children', () => {
    expect(byName(g, 'ts23d_finish_unused')).toBeUndefined();
    const velvet = byName(g, 'ts23d_finish_velvet');
    expect(velvet?.extensions?.['KHR_materials_sheen']?.['sheenRoughnessFactor']).toBe(0.6);
    const brushed = byName(g, 'ts23d_finish_brushed') as unknown as {
      pbrMetallicRoughness: Record<string, unknown>;
      extensions: Record<string, Record<string, unknown>>;
    };
    expect(brushed.pbrMetallicRoughness['metallicFactor']).toBe(1);
    expect(brushed.extensions['KHR_materials_anisotropy']?.['anisotropyStrength']).toBe(0.8);
    expect(brushed.extensions['KHR_materials_iridescence']?.['iridescenceThicknessMaximum']).toBe(
      500,
    );
    const node = g.nodes.find((n) => n.name === 'body_finish_velvet');
    const mat = g.meshes[node?.mesh ?? -1]?.primitives[0]?.material ?? -1;
    expect(g.materials[mat]?.name).toBe('ts23d_finish_velvet');
  });
  it('ice absorbs blue-ish; glass optics override replaces the preset numbers', () => {
    const ice = byName(g, 'ts23d_ice')?.extensions;
    expect(ice?.['KHR_materials_ior']).toEqual({ ior: 1.31 });
    expect(ice?.['KHR_materials_volume']?.['attenuationDistance']).toBe(0.4);
    const glass = byName(g, 'ts23d_glass')?.extensions;
    expect(glass?.['KHR_materials_ior']).toEqual({ ior: 1.52 });
    expect(glass?.['KHR_materials_volume']).toEqual({ thicknessFactor: 0.004 });
  });
  it('the single-file LOD GLB carries the same materials', () => {
    const lods = [0, 1, 2].map((lod) => compile(full, { lod: lod as 0 | 1 | 2 }));
    const one = jsonOf(toLodGlb(lods));
    expect(one.materials.map((m) => m.name)).toEqual(g.materials.map((m) => m.name));
  });
});
