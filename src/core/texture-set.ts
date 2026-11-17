// A part's own texture set (ADR 016): albedo / normal / ORM PNG bytes a model-built part carries on
// every LOD instead of the shared trim sheet. This file owns the type, the PNG header read (IHDR
// only: core never decodes pixels) and the checks on one set; budgets live in validate-asset.ts.

import { Ts23dError } from './errors.ts';

export interface TextureSet {
  /** Stable name; parts sharing a name share one material (one draw per pivot still holds). */
  readonly name: string;
  /** PNG bytes. sRGB base colour (RGB or RGBA; alpha = cutout mask when the part is `cutout`). */
  readonly albedo: Uint8Array;
  /** PNG bytes, tangent-space normal, glTF green-up (MikkTSpace from the part's UVs). */
  readonly normal?: Uint8Array;
  /** PNG bytes, R occlusion · G roughness · B metallic. */
  readonly orm?: Uint8Array;
  /** Used when `orm` is absent. Defaults 0.8 / 0. */
  readonly roughness?: number;
  readonly metallic?: number;
  /** Where the pixels came from (model, licence): goes to the manifest and GLB extras. */
  readonly credit?: string;
}

/** The map slots of a set, in the order they are checked and written. */
export const TEXTURE_MAPS = ['albedo', 'normal', 'orm'] as const;
export type TextureMap = (typeof TEXTURE_MAPS)[number];

export const TEXTURE_SIZES = [1024, 2048, 4096] as const;
export type TextureSize = (typeof TEXTURE_SIZES)[number];

/** `budget.textureSets`: how many distinct sets an asset may carry and the largest map edge. */
export interface TextureBudget {
  readonly count: number;
  readonly size: TextureSize;
}

/** Factors used when a set has no `orm` map and names none itself. */
export const TEXTURE_DEFAULTS = { roughness: 0.8, metallic: 0 } as const;

export interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  /** PNG colour type: 0 grey, 2 RGB, 3 palette, 4 grey + alpha, 6 RGBA. */
  readonly colourType: number;
  readonly alpha: boolean;
}

export function textureInvalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_TEXTURE_INVALID', { cause, fix });
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const IHDR = [73, 72, 68, 82];

/** Size and pixel format from a PNG's IHDR chunk; `null` when the bytes are not a PNG. */
export function pngHeader(bytes: Uint8Array): PngHeader | null {
  if (!(bytes instanceof Uint8Array) || bytes.length < 33) return null;
  if (SIGNATURE.some((b, i) => bytes[i] !== b) || IHDR.some((b, i) => bytes[12 + i] !== b))
    return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(8) !== 13) return null;
  const colourType = dv.getUint8(25);
  return {
    width: dv.getUint32(16),
    height: dv.getUint32(20),
    bitDepth: dv.getUint8(24),
    colourType,
    alpha: colourType === 4 || colourType === 6,
  };
}

const keys = new WeakMap<Uint8Array, string>();

/**
 * Content key of a map: length + two 32-bit hashes, computed once per byte array (memoised by
 * identity). Equal bytes give equal keys, so writers can also use it to store each image once.
 */
export function textureKey(bytes: Uint8Array): string {
  const known = keys.get(bytes);
  if (known !== undefined) return known;
  let a = 0x811c9dc5;
  let b = 5381;
  for (const v of bytes) {
    a = Math.imul(a ^ v, 0x01000193);
    b = (Math.imul(b, 33) + v) | 0;
  }
  const key = `${bytes.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
  keys.set(bytes, key);
  return key;
}

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined): boolean =>
  a === b ||
  (a !== undefined && b !== undefined && a.length === b.length && textureKey(a) === textureKey(b));

/** Two sets are one material: same maps (identity, else length + content key) and factors. */
export function sameTextureSet(a: TextureSet, b: TextureSet): boolean {
  if (a === b) return true;
  return (
    a.name === b.name &&
    TEXTURE_MAPS.every((m) => sameBytes(a[m], b[m])) &&
    a.roughness === b.roughness &&
    a.metallic === b.metallic &&
    a.credit === b.credit
  );
}

const NAME = /^[a-z][a-z0-9_]*$/;
const unit = (v: number | undefined): boolean => v === undefined || (v >= 0 && v <= 1);

function checkMap(where: string, map: TextureMap, bytes: Uint8Array, cap: number): PngHeader {
  const at = `${where} ${map}`;
  const h = pngHeader(bytes);
  if (!h)
    textureInvalid(
      `${at} is not PNG bytes`,
      `pass the PNG file's bytes (Uint8Array), e.g. from ctx.neural or importModel; JPEG/WebP must be converted first`,
    );
  if (!(h.colourType === 2 || h.colourType === 6) || !(h.bitDepth === 8 || h.bitDepth === 16))
    textureInvalid(
      `${at} is PNG colour type ${h.colourType} at ${h.bitDepth} bits`,
      're-save it as 8- or 16-bit RGB or RGBA (no palette, no greyscale)',
    );
  const pow2 = h.width > 0 && (h.width & (h.width - 1)) === 0;
  if (h.width !== h.height || !pow2)
    textureInvalid(
      `${at} is ${h.width}×${h.height}`,
      `bake it square at a power of two, at most ${cap}×${cap}`,
    );
  if (h.width > cap)
    textureInvalid(
      `${at} is ${h.width}², above the ${cap}² the budget allows`,
      `bake or resize it to ${cap}², or raise budget.textureSets.size with a measured reason`,
    );
  return h;
}

/**
 * One set is usable: snake_case name, every map a square power-of-two RGB/RGBA PNG at most
 * `cap` on a side, factors in 0..1. Returns the albedo header (the caller needs its alpha).
 */
export function checkTextureSet(where: string, set: TextureSet, cap: number = 4096): PngHeader {
  if (typeof set?.name !== 'string' || !NAME.test(set.name))
    textureInvalid(
      `${where} has a texture set named '${set?.name}', which is not snake_case`,
      "name it [a-z][a-z0-9_]*, e.g. textures: { name: 'wolf_body', albedo }",
    );
  const at = `${where} texture set '${set.name}'`;
  const albedo = checkMap(at, 'albedo', set.albedo, cap);
  if (set.normal !== undefined) checkMap(at, 'normal', set.normal, cap);
  if (set.orm !== undefined) checkMap(at, 'orm', set.orm, cap);
  for (const k of ['roughness', 'metallic'] as const)
    if (!unit(set[k]))
      textureInvalid(`${at} ${k} is ${set[k]}, outside 0..1`, 'use a fraction 0..1, or omit it');
  return albedo;
}

/** The distinct sets of a part list, by name, in order of first use (stable across LODs). */
export function textureSetsOf(
  parts: readonly { readonly textures?: TextureSet }[],
): readonly TextureSet[] {
  const seen = new Map<string, TextureSet>();
  for (const p of parts)
    if (p.textures && !seen.has(p.textures.name)) seen.set(p.textures.name, p.textures);
  return [...seen.values()];
}
