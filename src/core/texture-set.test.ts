import { describe, expect, it } from 'bun:test';
import { Ts23dError } from './errors.ts';
import { encodePng } from './png.ts';
import {
  checkTextureSet,
  pngHeader,
  sameTextureSet,
  type TextureSet,
  textureKey,
  textureSetsOf,
} from './texture-set.ts';

/** A PNG signature + IHDR (all core reads); `salt` makes the bytes after it differ. */
function png(width: number, height: number, colourType = 6, bitDepth = 8, salt = 0): Uint8Array {
  const out = new Uint8Array(40);
  out.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const dv = new DataView(out.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  out.set([bitDepth, colourType], 24);
  out[39] = salt;
  return out;
}

/** `code|fix` of the thrown Ts23dError, 'none' when nothing throws. */
function thrown(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.message}|${e.fix}`;
    throw e;
  }
  return 'none';
}
const check = (over: Partial<TextureSet>, cap?: number) => () =>
  checkTextureSet("part 'body'", { name: 'wolf', albedo: png(1024, 1024), ...over }, cap);
const invalid = /^T3D_TEXTURE_INVALID\|.+\|.+/;

describe('pngHeader', () => {
  it('is null for bytes that are not a PNG', () => {
    expect(pngHeader(new Uint8Array(64))).toBeNull();
    expect(pngHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(pngHeader(png(8, 8).subarray(0, 20))).toBeNull();
    expect(pngHeader('wolf.png' as never)).toBeNull();
  });

  it('reads size and pixel format from a real PNG, at any byte offset', () => {
    const real = encodePng(4, 2, new Uint8Array(4 * 2 * 4));
    expect(pngHeader(real)).toEqual({
      width: 4,
      height: 2,
      bitDepth: 8,
      colourType: 6,
      alpha: true,
    });
    const padded = new Uint8Array(real.length + 3);
    padded.set(real, 3);
    expect(pngHeader(padded.subarray(3))?.width).toBe(4);
    expect(pngHeader(png(16, 16, 2))?.alpha).toBe(false);
  });
});

describe('checkTextureSet', () => {
  it('refuses non-PNG bytes, naming the map', () => {
    expect(thrown(check({ albedo: new Uint8Array(100) }))).toMatch(/albedo is not PNG bytes/);
    expect(thrown(check({ normal: new Uint8Array(100) }))).toMatch(/normal is not PNG bytes/);
    expect(thrown(check({ albedo: undefined as never }))).toMatch(invalid);
  });

  it('refuses a non-square or non-power-of-two map', () => {
    expect(thrown(check({ albedo: png(1024, 512) }))).toMatch(/1024×512/);
    expect(thrown(check({ orm: png(1000, 1000) }))).toMatch(/orm is 1000×1000/);
    expect(thrown(check({ albedo: png(0, 0) }))).toMatch(invalid);
  });

  it('refuses a map above the cap, with the cap in the fix', () => {
    expect(thrown(check({ albedo: png(4096, 4096) }, 2048))).toMatch(/above the 2048².*2048²/);
    expect(thrown(check({ normal: png(2048, 2048) }, 1024))).toMatch(invalid);
    expect(thrown(check({ albedo: png(2048, 2048) }, 2048))).toBe('none');
  });

  it('refuses palette and greyscale PNGs, a bad name and factors outside 0..1', () => {
    expect(thrown(check({ albedo: png(64, 64, 3) }))).toMatch(/colour type 3/);
    expect(thrown(check({ orm: png(64, 64, 0) }))).toMatch(invalid);
    expect(thrown(check({ albedo: png(64, 64, 6, 4) }))).toMatch(invalid);
    expect(thrown(check({ name: 'Wolf Body' }))).toMatch(/snake_case/);
    expect(thrown(check({ roughness: 1.5 }))).toMatch(/roughness is 1.5/);
    expect(thrown(check({ metallic: Number.NaN }))).toMatch(invalid);
  });

  it('accepts RGB or RGBA maps and returns the albedo header', () => {
    const set = { normal: png(512, 512, 2, 16), orm: png(256, 256, 2), roughness: 0.6 };
    expect(check({ albedo: png(1024, 1024, 2), ...set })().alpha).toBe(false);
    expect(check(set)().alpha).toBe(true);
  });
});

describe('sameTextureSet', () => {
  const a: TextureSet = { name: 'wolf', albedo: png(64, 64), normal: png(64, 64, 2) };

  it('tells different bytes, a missing map and different factors apart', () => {
    expect(sameTextureSet(a, { ...a, albedo: png(64, 64, 6, 8, 1) })).toBe(false);
    expect(sameTextureSet(a, { name: 'wolf', albedo: a.albedo })).toBe(false);
    expect(sameTextureSet(a, { ...a, roughness: 0.4 })).toBe(false);
    expect(sameTextureSet(a, { ...a, name: 'bear' })).toBe(false);
  });

  it('matches equal content in separate arrays, and keys each array once', () => {
    const copy = { name: 'wolf', albedo: png(64, 64), normal: png(64, 64, 2) };
    expect(sameTextureSet(a, copy)).toBe(true);
    expect(sameTextureSet(a, a)).toBe(true);
    expect(textureKey(a.albedo)).toBe(textureKey(copy.albedo));
    // Memoised by identity: a later write to the same array does not re-hash it.
    const bytes = png(8, 8);
    const key = textureKey(bytes);
    bytes[39] = 9;
    expect(textureKey(bytes)).toBe(key);
    expect(textureKey(png(8, 8, 6, 8, 9))).not.toBe(key);
  });
});

describe('textureSetsOf', () => {
  it('lists distinct sets by name in order of first use', () => {
    const wolf: TextureSet = { name: 'wolf', albedo: png(64, 64) };
    const eye: TextureSet = { name: 'eye', albedo: png(64, 64) };
    const parts = [{ textures: wolf }, {}, { textures: eye }, { textures: { ...wolf } }];
    expect(textureSetsOf(parts)).toEqual([wolf, eye]);
    expect(textureSetsOf([{}])).toEqual([]);
  });
});
