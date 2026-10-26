import { beforeAll, describe, expect, it } from 'bun:test';
import { compile, defineAsset } from '../core/index.ts';
import { DEFAULT_SHEET, type PaintedSheet, paintTrimSheet } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';
import { sheetFileName, sheetPngs } from './textures.ts';

const shed = defineAsset({
  name: 'shed',
  kind: 'prop',
  budget: { triangles: [99, 99, 99] },
  build(ctx) {
    ctx.part('walls', box({ size: [2, 2, 2], color: [0.6, 0.3, 0.2], strip: 'brick' }));
    ctx.part('leaves', box({ size: [1, 1, 0.1], at: [0, 0, 2], color: [1, 1, 1] }), {
      surface: 'cutout',
    });
  },
});

let sheet: PaintedSheet;
beforeAll(() => {
  sheet = paintTrimSheet({ ...DEFAULT_SHEET, size: 512 });
});

function parse(glb: Uint8Array) {
  const dv = new DataView(glb.buffer, glb.byteOffset);
  const len = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
  const binLen = dv.getUint32(20 + len, true);
  return { json, bin: glb.subarray(28 + len, 28 + len + binLen) };
}

describe('toGlb sheet embedding', () => {
  it('is byte-identical to the untextured output without a sheet', () => {
    const a = toGlb(compile(shed));
    const b = toGlb(compile(shed), { animations: false });
    expect(Bun.hash(a)).toBe(Bun.hash(b));
    expect(parse(a).json.images).toBeUndefined();
    expect(parse(a).json.materials[0].pbrMetallicRoughness.baseColorTexture).toBeUndefined();
  });

  it('embeds three PNGs in the BIN chunk and binds them on every material', () => {
    const { json, bin } = parse(toGlb(compile(shed), { sheet }));
    expect(json.images.map((i: { mimeType: string }) => i.mimeType)).toEqual([
      'image/png',
      'image/png',
      'image/png',
    ]);
    for (const img of json.images) {
      const v = json.bufferViews[img.bufferView];
      expect(v.target).toBeUndefined();
      expect([...bin.subarray(v.byteOffset, v.byteOffset + 4)]).toEqual([137, 80, 78, 71]);
    }
    expect(json.samplers).toEqual([
      { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 33071 },
    ]);
    expect(json.materials.map((m: { name: string }) => m.name)).toEqual([
      'ts23d_trim',
      'ts23d_trim_cutout',
    ]);
    for (const m of json.materials) {
      expect(m.pbrMetallicRoughness.baseColorTexture).toEqual({ index: 0 });
      expect(m.normalTexture).toEqual({ index: 1 });
      expect(m.occlusionTexture).toEqual({ index: 2 });
      expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toEqual({ index: 2 });
    }
    expect(json.buffers[0].byteLength).toBe(bin.byteLength);
  });

  it('is byte-deterministic with an embedded sheet', () => {
    expect(Bun.hash(toGlb(compile(shed), { sheet }))).toBe(
      Bun.hash(toGlb(compile(shed), { sheet })),
    );
  });

  it('references a shared external sheet by URI, embedding nothing', () => {
    const plain = toGlb(compile(shed));
    const ext = toGlb(compile(shed), { sheet: { external: true, prefix: '../tex/trim_sheet' } });
    const { json } = parse(ext);
    expect(json.images.map((i: { uri: string }) => i.uri)).toEqual([
      '../tex/trim_sheet_albedo.png',
      '../tex/trim_sheet_normal.png',
      '../tex/trim_sheet_orm.png',
    ]);
    expect(ext.byteLength - plain.byteLength).toBeLessThan(2000);
    expect(sheetFileName('orm')).toBe('trim_sheet_orm.png');
  });

  it('encodes each sheet once and reuses the PNGs', () => {
    expect(sheetPngs(sheet)).toBe(sheetPngs(sheet));
  });
});
