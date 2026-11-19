import { describe, expect, it } from 'bun:test';
import { encodePng } from '../../core/index.ts';
import type { TextureSource } from '../texture-source.ts';
import { provideTextures } from '../texture-source.ts';
import { createCanvas } from './canvas.ts';
import { paintImageStrip } from './image-strip.ts';
import { cavityOcclusion, packAlbedo } from './orm.ts';
import { paintStrip } from './strip.ts';
import type { MaterialPainter, StripRecipe } from './types.ts';

const W = 64;
function png(f: (x: number, y: number) => readonly number[]): Uint8Array {
  const px = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) px.set(f(x, y), (y * W + x) * 4);
  return encodePng(W, W, px);
}
const sha = (b: Uint8Array): string => new Bun.CryptoHasher('sha256').update(b).digest('hex');

const checker = png((x) => (x % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
const flatNormal = png(() => [128, 128, 255, 255]);
const tilted = png(() => [200, 90, 220, 255]);
const solid = png(() => [180, 120, 80, 255]);
provideTextures(new Map([checker, flatNormal, tilted, solid].map((b) => [sha(b), b])));

function source(albedo: Uint8Array, normal?: Uint8Array): TextureSource {
  return {
    source: 'file',
    id: 't',
    license: 'CC0-1.0',
    page: 'https://example.org/t',
    metres: [1, 1],
    maps: {
      albedo: { url: 'a.png', sha256: sha(albedo) },
      ...(normal ? { normal: { url: 'n.png', sha256: sha(normal) } } : {}),
    },
  };
}
const recipe: StripRecipe = { kind: 'flat', scaleMetres: 1, roughness: 0.5 };
const texel = (a: Uint8Array | null, i = 0): number[] => [
  ...(a ?? new Uint8Array()).subarray(i * 4, i * 4 + 4),
];

describe('paintImageStrip: resampling', () => {
  // 1 m image over a 4 m strip, 32 texels across: 8 image columns per texel.
  const c = createCanvas(32, 8, 4, 1, true);
  paintImageStrip(c, recipe, source(checker, flatNormal), 'test');

  it('averages albedo in linear light, not sRGB bytes (0/255 checker → 188, not 127)', () => {
    expect(texel(c.rgba).slice(0, 3)).toEqual([188, 188, 188]);
  });

  it('rounds normal bytes: a flat normal map stays [128, 128, 255]', () => {
    expect(texel(c.normalRgba)).toEqual([128, 128, 255, 255]);
  });

  it('round-trips a tilted normal within one step, green flipped', () => {
    const t = createCanvas(32, 8, 4, 1, true);
    paintImageStrip(t, recipe, source(solid, tilted), 'test');
    const [r = 0, g = 0, b = 0] = texel(t.normalRgba);
    const n = [(200 - 128) / 127, -(90 - 128) / 128, (220 - 128) / 127];
    const l = Math.hypot(...n);
    const want = n.map((v) => 128 + (v / l) * (v < 0 ? 128 : 127));
    [r, g, b].forEach((v, k) => {
      expect(Math.abs(v - (want[k] ?? 0))).toBeLessThanOrEqual(1);
    });
    expect(g).toBeGreaterThan(128);
  });

  it('keeps a uniform image byte-exact', () => {
    const t = createCanvas(32, 8, 4, 1, true);
    paintImageStrip(t, recipe, source(solid), 'test');
    expect(texel(t.rgba)).toEqual([180, 120, 80, 255]);
  });
});

describe('image strips take tone changes', () => {
  function albedo(params?: Record<string, number>, paint?: MaterialPainter): number[] {
    const c = createCanvas(64, 8, 4, 1, true);
    paintStrip(
      c,
      {
        ...recipe,
        texture: source(solid),
        ...(params ? { params } : {}),
        ...(paint ? { paint } : {}),
      },
      1,
    );
    return texel(packAlbedo(c, cavityOcclusion(c)));
  }
  const dry = albedo();

  it('a dry, unpainted image strip keeps the photo bytes', () => {
    expect(dry).toEqual([180, 120, 80, 255]);
  });

  it('wet and age darken it; alpha stays', () => {
    for (const p of [{ wet: 1 }, { age: 1 }]) {
      const a = albedo(p);
      for (const k of [0, 1, 2]) expect(a[k] ?? 255).toBeLessThan(dry[k] ?? 0);
      expect(a[3]).toBe(255);
    }
  });

  it("a recipe's paint layer tone reaches the albedo (tone 0 → black)", () => {
    expect(albedo(undefined, (s) => s.tone.fill(0))).toEqual([0, 0, 0, 255]);
  });

  it('applies tone in linear light (tone 0.5 on sRGB 180 → 131)', () => {
    expect(albedo(undefined, (s) => s.tone.fill(0.5))[0]).toBe(131);
  });
});
