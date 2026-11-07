import { describe, expect, it } from 'bun:test';
import { compile, defineAsset, MeshBuilder } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { exportGlb, toGlb } from './glb.ts';

const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('body', box({ size: [1, 1, 1], color: [0.5, 0.4, 0.3] }));
    ctx.emitter('chimney_smoke', {
      kind: 'smoke',
      at: [0, 0, 1.1],
      rate: 8,
      life: 3,
      size: [0.2, 1.5],
    });
    ctx.part('lid', box({ size: [1, 1, 0.1], color: [0.5, 0.4, 0.3] }), {
      at: [0, 0, 1],
      motion: { kind: 'spin', axis: [0, 0, 1], rps: 0.5 },
    });
  },
});

describe('toGlb', () => {
  it('writes a valid GLB header and JSON chunk', () => {
    const glb = toGlb(compile(crate), { animations: true });
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))),
    );
    expect(json.nodes.map((n: { name: string }) => n.name)).toEqual([
      'crate',
      'body',
      'chimney_smoke',
      'lid',
    ]);
    expect(json.nodes[2].extras.ts23d.emitter.kind).toBe('smoke');
    const raw = toGlb(compile(crate), { keepParts: true });
    expect(raw.byteLength).toBeGreaterThan(0);
    expect(json.animations.map((a: { name: string }) => a.name)).toEqual(['rest', 'run']);
    expect(json.animations[1].channels).toHaveLength(1);
  });

  it('ships no animation unless asked (viewers autoplay the first clip)', () => {
    const glb = toGlb(compile(crate));
    const dv = new DataView(glb.buffer);
    const json = JSON.parse(
      new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))),
    );
    expect(json.animations).toBeUndefined();
  });

  it('is byte-deterministic', () => {
    expect(Bun.hash(toGlb(compile(crate)))).toBe(Bun.hash(toGlb(compile(crate))));
  });
});

// A 4×4 quad grid emitted as a triangle soup: every quad has its own 4 vertices.
const soup = defineAsset({
  name: 'soup',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    const b = new MeshBuilder();
    const v = (x: number, y: number) =>
      b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 4; y++) b.quad(v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1));
    ctx.part('floor', b.build());
  },
});

describe('exportGlb optimisation', () => {
  it('writes meshes untouched with optimize: false', () => {
    const { report } = exportGlb(compile(soup), { optimize: false });
    expect(report.optimized).toBe(false);
    expect(report.verticesAfter).toBe(64);
  });

  it('welds and reorders by default, reports it, and stays deterministic', () => {
    const { glb, report } = exportGlb(compile(soup));
    expect(report.optimized).toBe(true);
    expect(report.verticesBefore).toBe(64);
    expect(report.verticesAfter).toBe(25);
    expect(report.acmr).toBeLessThan(report.acmrBefore);
    expect(report.parts.map((p) => p.part)).toEqual(['body']);
    expect(glb.byteLength).toBeLessThan(
      exportGlb(compile(soup), { optimize: false }).glb.byteLength,
    );
    expect(Bun.hash(glb)).toBe(Bun.hash(toGlb(compile(soup))));
  });
});

const lamp = defineAsset({
  name: 'lamp_post',
  kind: 'prop',
  budget: { triangles: [100, 100, 100] },
  build(ctx) {
    ctx.part('post', box({ size: [0.1, 0.1, 3], color: [0.2, 0.2, 0.2] }));
    ctx.part('bulb', box({ size: [0.2, 0.2, 0.2], at: [0, 0, 3], color: [1, 1, 1] }));
    ctx.socket('bulb_light', {
      kind: 'light',
      at: [0, 0, 2.95],
      dir: [0, 0, -1],
      data: { light: 'spot', color: '#ffffff', cone: 40, range: 12 },
    });
  },
});
const jsonOf = (glb: Uint8Array) =>
  JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + new DataView(glb.buffer).getUint32(12, true))),
  );

describe('toGlb viewer extras', () => {
  it('rejects a glow colour outside 0..1', () => {
    expect(() => toGlb(compile(lamp), { glow: [{ parts: ['bulb'], color: [2, 1, 1] }] })).toThrow(
      /T3D_RECIPE_INVALID/,
    );
  });

  it('writes core-only by default: versioned generator, named scene, no extensions', () => {
    const j = jsonOf(toGlb(compile(crate)));
    expect(j.asset.generator).toMatch(/^@developerz-ai\/ts23d \d+\.\d+\.\d+/);
    expect(j.scenes).toEqual([{ name: 'crate', nodes: [0] }]);
    expect(j.extensionsUsed).toBeUndefined();
  });

  it('turns a light socket into a KHR_lights_punctual child pointing along dir', () => {
    const j = jsonOf(toGlb(compile(lamp)));
    expect(j.extensionsUsed).toEqual(['KHR_lights_punctual']);
    const [light] = j.extensions.KHR_lights_punctual.lights;
    expect(light.type).toBe('spot');
    expect(light.range).toBe(12);
    expect(light.spot.outerConeAngle).toBeCloseTo((40 * Math.PI) / 180, 6);
    const node = j.nodes.find((n: { name: string }) => n.name === 'bulb_light_light');
    // dir = −Z (authoring) equals the light's own −Z: identity rotation.
    expect(node.rotation).toEqual([0, 0, 0, 1]);
    expect(node.extensions.KHR_lights_punctual.light).toBe(0);
  });

  it('splits glowing parts into an emissive material and writes XMP provenance', () => {
    const j = jsonOf(
      toGlb(compile(lamp), {
        glow: [{ parts: ['bulb*'], strength: 8 }],
        meta: {
          copyright: '© 2026 A. Maker',
          license: 'CC-BY-4.0',
          sources: ['https://x.example'],
        },
      }),
    );
    expect(j.asset.copyright).toBe('© 2026 A. Maker');
    expect(j.asset.extensions.KHR_xmp_json_ld.packet).toBe(0);
    const packet = j.extensions.KHR_xmp_json_ld.packets[0];
    expect(packet['xmpRights:UsageTerms']['rdf:_1']['@value']).toBe('CC-BY-4.0');
    expect(packet['dc:relation']['@set']).toEqual(['https://x.example']);
    const glowMat = j.materials.findIndex((m: { name: string }) => m.name === 'ts23d_glow_0');
    expect(j.materials[glowMat].extensions.KHR_materials_emissive_strength.emissiveStrength).toBe(
      8,
    );
    const glowMesh = j.meshes.find((m: { name: string }) => m.name === 'body_glow_0');
    expect(glowMesh.primitives[0].material).toBe(glowMat);
    expect(j.extensionsUsed).toEqual([
      'KHR_lights_punctual',
      'KHR_materials_emissive_strength',
      'KHR_xmp_json_ld',
    ]);
  });
});
