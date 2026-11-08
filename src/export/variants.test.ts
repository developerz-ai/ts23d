// KHR_materials_variants: paint slots become materials, liveries become variants mapped per
// primitive; without `paint` the bytes do not change; Khronos-valid in split and single-file GLBs.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { type AssetDefinition, compile, defineAsset, type Lod } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb, toLodGlb } from './glb.ts';

type Json = Record<string, unknown>;
interface Gltf {
  nodes: { name: string; mesh?: number }[];
  meshes: { name: string; primitives: { material: number; extensions?: Json }[] }[];
  materials: { name: string; pbrMetallicRoughness: { baseColorFactor: number[] } }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  extensions?: Json;
}
const json = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};

const red: [number, number, number] = [0.4, 0.1, 0.05];
const cream: [number, number, number] = [0.8, 0.75, 0.6];
const def = (over: Partial<AssetDefinition> = {}): AssetDefinition => ({
  name: 'car',
  kind: 'vehicle',
  budget: { triangles: [9999, 9999, 9999] },
  paint: { body: red, stripe: cream },
  variants: {
    blue: { body: [0.05, 0.1, 0.4] },
    navy_cream: { body: [0.05, 0.1, 0.4], stripe: '#f0e0b0' },
    red: { body: red },
  },
  build(ctx) {
    ctx.part('hull', box({ size: [2, 1, 0.6], at: [0, 0, 0.3], color: [0.2, 0.05, 0.025] }), {
      paint: 'body',
    });
    ctx.part('tyre', box({ size: [0.6, 0.2, 0.6], at: [0, 0.6, 0.3], color: [0.1, 0.1, 0.1] }));
    ctx.group('door', {
      at: [0, 0.5, 0.3],
      motion: { kind: 'sway', axis: [0, 0, 1], degrees: 40, hz: 0.2 },
    });
    ctx.part('door_skin', box({ size: [0.8, 0.05, 0.5], color: red }), {
      parent: 'door',
      paint: 'body',
    });
    if (ctx.lod === 0)
      ctx.part('stripe', box({ size: [2, 1.02, 0.05], at: [0, 0, 0.5], color: cream }), {
        paint: 'stripe',
      });
  },
  ...over,
});

async function validate(glb: Uint8Array) {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    const report = await validateBytes(glb);
    return report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
  } finally {
    Math.random = sealed;
  }
}

describe('variants: refusals', () => {
  it('refuses to export an asset compiled as a variant preview (would double-paint)', () => {
    expect(() => toGlb(compile(defineAsset(def()), { variant: 'blue' }))).toThrow(
      /compiled as variant 'blue'/,
    );
  });
});

describe('variants: KHR_materials_variants', () => {
  const g = json(toGlb(compile(defineAsset(def()))));

  it('lists the variants at the root, used not required', () => {
    expect(g.extensions?.['KHR_materials_variants']).toEqual({
      variants: [{ name: 'blue' }, { name: 'navy_cream' }, { name: 'red' }],
    });
    expect(g.extensionsUsed).toContain('KHR_materials_variants');
    expect(g.extensionsRequired).toBeUndefined();
  });

  it('one material per slot + one per distinct repaint, deduplicated', () => {
    const names = g.materials.map((m) => m.name);
    expect(names).toEqual([
      'ts23d_trim',
      'ts23d_paint_body',
      'ts23d_paint_stripe',
      'ts23d_paint_body_blue',
      'ts23d_paint_stripe_navy_cream',
    ]);
    expect(g.materials[1]?.pbrMetallicRoughness.baseColorFactor).toEqual([...red, 1]);
  });

  it('painted primitives map variants; plain ones carry no mapping', () => {
    const byName = new Map(g.meshes.map((m) => [m.name, m.primitives[0]]));
    const body = byName.get('body_paint_body');
    expect(body?.material).toBe(1);
    // blue + navy_cream share one material; `red` repaints with the default colour → default.
    expect(body?.extensions?.['KHR_materials_variants']).toEqual({
      mappings: [
        { material: 3, variants: [0, 1] },
        { material: 1, variants: [2] },
      ],
    });
    expect(byName.get('door_paint_body')?.material).toBe(1);
    expect(byName.get('body_paint_stripe')?.extensions?.['KHR_materials_variants']).toEqual({
      mappings: [{ material: 4, variants: [1] }],
    });
    expect(byName.get('body')?.extensions).toBeUndefined();
    expect(byName.get('body')?.material).toBe(0);
  });

  it('default paint: COLOR_0 × factor reproduces the authored colour (tone survives)', () => {
    const glb = toGlb(compile(defineAsset(def())), { optimize: false });
    const gj = json(glb) as Gltf & {
      accessors: { bufferView: number; byteOffset?: number }[];
      bufferViews: { byteOffset?: number }[];
    };
    const prim = gj.meshes.find((m) => m.name === 'body_paint_body')?.primitives[0] as unknown as {
      attributes: { COLOR_0: number };
    };
    const acc = gj.accessors[prim.attributes.COLOR_0];
    const view = gj.bufferViews[acc?.bufferView ?? 0];
    const jsonLen = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
    const at = 28 + jsonLen + (view?.byteOffset ?? 0) + (acc?.byteOffset ?? 0);
    const dv = new DataView(glb.buffer, glb.byteOffset + at);
    const rgb = [0, 2, 4].map((o) => dv.getUint16(o, true) / 65535);
    // hull [0.2, 0.05, 0.025] = half the slot colour → tone 0.5 on every channel.
    for (const v of rgb) expect(v).toBeCloseTo(0.5, 3);
    const factor = gj.materials[(prim as unknown as { material: number }).material];
    const lit = rgb.map((v, i) => v * (factor?.pbrMetallicRoughness.baseColorFactor[i] ?? 0));
    for (const [i, v] of [0.2, 0.05, 0.025].entries()) expect(lit[i] ?? 0).toBeCloseTo(v, 4);
  });

  it('paint without variants: slot materials, no extension', () => {
    const plain = json(toGlb(compile(defineAsset(def({ variants: {} })))));
    expect(plain.extensionsUsed ?? []).not.toContain('KHR_materials_variants');
    expect(plain.materials.map((m) => m.name)).toContain('ts23d_paint_body');
  });

  it('no paint: byte-identical to an asset that never heard of paint', () => {
    const { paint: _p, variants: _v, build, ...rest } = def();
    const bare = defineAsset({
      ...rest,
      build: (ctx) =>
        build({
          ...ctx,
          part: (n, m, o) => {
            const { paint: _drop, ...keep } = o ?? {};
            ctx.part(n, m, keep);
          },
        }),
    });
    const legacy = defineAsset({
      ...rest,
      build(ctx) {
        ctx.part('hull', box({ size: [2, 1, 0.6], at: [0, 0, 0.3], color: [0.2, 0.05, 0.025] }));
        ctx.part('tyre', box({ size: [0.6, 0.2, 0.6], at: [0, 0.6, 0.3], color: [0.1, 0.1, 0.1] }));
        ctx.group('door', {
          at: [0, 0.5, 0.3],
          motion: { kind: 'sway', axis: [0, 0, 1], degrees: 40, hz: 0.2 },
        });
        ctx.part('door_skin', box({ size: [0.8, 0.05, 0.5], color: red }), { parent: 'door' });
        ctx.part('stripe', box({ size: [2, 1.02, 0.05], at: [0, 0, 0.5], color: cream }));
      },
    });
    expect(toGlb(compile(bare))).toEqual(toGlb(compile(legacy)));
  });
});

describe('variants: single-file LODs + validator', () => {
  const asset = defineAsset(def());
  const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));

  it('every LOD maps its painted primitives to the same shared materials', () => {
    const g = json(toLodGlb(lods));
    const painted = g.meshes.filter((m) => m.name.endsWith('_paint_body'));
    expect(painted.length).toBe(6); // body + door, × 3 LODs
    for (const m of painted) expect(m.primitives[0]?.material).toBe(1);
  });

  it('glTF-Validator: 0 errors, 0 warnings (split and single, with a sheet-less build)', async () => {
    expect(await validate(toGlb(lods[0] ?? compile(asset), { animations: true }))).toEqual([]);
    expect(await validate(toLodGlb(lods, { animations: true }))).toEqual([]);
  });
});
