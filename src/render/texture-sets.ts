// A part's own texture set (ADR 016) as the renderers sample it: each PNG decoded once per process
// (cached by content key, released with the last scene that holds it) into an 8-bit mip chain —
// level 0 is the decoded image itself, lower levels are box-filtered in linear space by the trim
// sheet's machinery (texture.ts, cutout-safe when the albedo has alpha) and re-quantised, so a
// 2048² map costs ≈ 22 MB instead of 89 MB of floats. Sampling is bilinear and CLAMPS on both
// axes: a set is a unique unwrap, never a tiling strip.

import {
  type CompiledAsset,
  pngHeader,
  TEXTURE_DEFAULTS,
  type TextureMap,
  type TextureSet,
  Ts23dError,
  textureKey,
  textureSetsOf,
} from '../core/index.ts';
import { decodePng, type Rgba } from '../material/index.ts';
import { toSrgb8 } from './lighting.ts';
import { chain, SRGB } from './texture.ts';

/** One level of an 8-bit mip chain, RGBA. */
export interface Mip8 {
  readonly size: number;
  readonly data: Uint8Array;
}

export interface SetTextures {
  readonly name: string;
  /** Albedo edge in texels: what the per-triangle mip level is measured against. */
  readonly size: number;
  /** sRGB + alpha. */
  readonly albedo: readonly Mip8[];
  /** Tangent-space normal, green up; empty when the set has none. */
  readonly normal: readonly Mip8[];
  /** R occlusion · G roughness · B metallic; empty when the set has none (use the factors). */
  readonly orm: readonly Mip8[];
  /** Mip levels the map is smaller than the albedo (subtract from the albedo's level). */
  readonly normalShift: number;
  readonly ormShift: number;
  readonly roughness: number;
  readonly metallic: number;
}

/** Byte → value tables for `sampleSet`: sRGB → linear, normal → −1…1, data → 0…1. */
export const SRGB_LUT: Float32Array = SRGB;
export const NORMAL_LUT = new Float32Array(256).map((_, i) => i / 127.5 - 1);
export const UNIT_LUT = new Float32Array(256).map((_, i) => i / 255);

const unit8 = (v: number): number => Math.round(255 * Math.min(1, Math.max(0, v)));
const DECODE: Readonly<Record<TextureMap, (c: number, v: number) => number>> = {
  albedo: (c, v) => (c === 3 ? v / 255 : (SRGB[v] ?? 0)),
  normal: (c, v) => (c === 3 ? 1 : v / 127.5 - 1),
  orm: (_c, v) => v / 255,
};
const ENCODE: Readonly<Record<TextureMap, (c: number, v: number) => number>> = {
  albedo: (c, v) => (c === 3 ? unit8(v) : toSrgb8(Math.max(0, v))),
  normal: (_c, v) => unit8(v * 0.5 + 0.5),
  orm: (_c, v) => unit8(v),
};

function decode(bytes: Uint8Array, where: string): Rgba {
  const bad = (cause: string): never => {
    throw new Ts23dError('T3D_TEXTURE_INVALID', {
      cause: `${where} cannot be rendered: ${cause}`,
      fix: 're-export the map as an 8- or 16-bit RGB or RGBA PNG, non-interlaced, square, power of two',
    });
  };
  let img: Rgba;
  try {
    img = decodePng(bytes, bad);
  } catch (e) {
    if (e instanceof Ts23dError) throw e;
    return bad(`its pixel data does not inflate (${e instanceof Error ? e.message : String(e)})`);
  }
  if (img.width !== img.height || (img.width & (img.width - 1)) !== 0)
    bad(`it is ${img.width}×${img.height}, not a square power of two`);
  return img;
}

const cache = new Map<string, WeakRef<readonly Mip8[]>>();

/** The mip chain of one map; decoded once per content key while any scene still holds it. */
function mapMips(bytes: Uint8Array, map: TextureMap, where: string): readonly Mip8[] {
  const key = `${map}:${textureKey(bytes)}`;
  const hit = cache.get(key)?.deref();
  if (hit) return hit;
  const img = decode(bytes, `${where} ${map}`);
  const cutout = map === 'albedo' && pngHeader(bytes)?.alpha === true;
  const enc = ENCODE[map];
  const out: Mip8[] = [{ size: img.width, data: img.data }];
  for (const m of chain(img.data, img.width, DECODE[map], cutout).slice(1)) {
    const data = new Uint8Array(m.data.length);
    for (let i = 0; i < data.length; i++) data[i] = enc(i & 3, m.data[i] ?? 0);
    out.push({ size: m.size, data });
  }
  for (const [k, r] of cache) if (!r.deref()) cache.delete(k);
  cache.set(key, new WeakRef(out));
  return out;
}

/** Decode `set` for rendering; `part` names the part in a T3D_TEXTURE_INVALID. */
export function setTextures(set: TextureSet, part: string): SetTextures {
  const where = `part '${part}' texture set '${set.name}'`;
  const albedo = mapMips(set.albedo, 'albedo', where);
  const normal = set.normal ? mapMips(set.normal, 'normal', where) : [];
  const orm = set.orm ? mapMips(set.orm, 'orm', where) : [];
  const size = albedo[0]?.size ?? 1;
  const shift = (m: readonly Mip8[]): number => Math.round(Math.log2(size / (m[0]?.size ?? size)));
  return {
    name: set.name,
    size,
    albedo,
    normal,
    orm,
    normalShift: shift(normal),
    ormShift: shift(orm),
    roughness: set.roughness ?? TEXTURE_DEFAULTS.roughness,
    metallic: set.metallic ?? TEXTURE_DEFAULTS.metallic,
  };
}

/** The decoded sets of an asset and each textured part's 1-based index into them (0 = sheet). */
export function assetSets(asset: Pick<CompiledAsset, 'parts'>): {
  sets: SetTextures[];
  byPart: Map<string, number>;
} {
  const names = textureSetsOf(asset.parts).map((s) => s.name);
  const sets: SetTextures[] = [];
  const byPart = new Map<string, number>();
  for (const p of asset.parts) {
    if (!p.textures) continue;
    const i = names.indexOf(p.textures.name);
    if (i > 254)
      throw new Ts23dError('T3D_TEXTURE_INVALID', {
        cause: `part '${p.name}' uses texture set #${i + 1}; the renderers index at most 255`,
        fix: 'share sets between parts (same name = one material)',
      });
    sets[i] ??= setTextures(p.textures, p.name);
    byPart.set(p.name, i + 1);
  }
  return { sets, byPart };
}

/** Bilinear, clamped sample of mip `level` at (u, v): `lut` decodes RGB, alpha is 0…1. */
export function sampleSet(
  mips: readonly Mip8[],
  level: number,
  u: number,
  v: number,
  lut: Float32Array,
  out: Float32Array,
): void {
  const m = mips[level <= 0 ? 0 : level >= mips.length ? mips.length - 1 : level];
  if (!m) return;
  const s = m.size;
  const x = Math.min(s - 1, Math.max(0, u * s - 0.5));
  const y = Math.min(s - 1, Math.max(0, v * s - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = Math.min(s - 1, x0 + 1);
  const y1 = Math.min(s - 1, y0 + 1);
  const d = m.data;
  const a = (y0 * s + x0) << 2;
  const b = (y0 * s + x1) << 2;
  const c = (y1 * s + x0) << 2;
  const e = (y1 * s + x1) << 2;
  const w0 = (1 - fx) * (1 - fy);
  const w1 = fx * (1 - fy);
  const w2 = (1 - fx) * fy;
  const w3 = fx * fy;
  for (let k = 0; k < 3; k++)
    out[k] =
      (lut[d[a + k] ?? 0] ?? 0) * w0 +
      (lut[d[b + k] ?? 0] ?? 0) * w1 +
      (lut[d[c + k] ?? 0] ?? 0) * w2 +
      (lut[d[e + k] ?? 0] ?? 0) * w3;
  out[3] =
    ((d[a + 3] ?? 255) * w0 +
      (d[b + 3] ?? 255) * w1 +
      (d[c + 3] ?? 255) * w2 +
      (d[e + 3] ?? 255) * w3) /
    255;
}

const texel = new Float32Array(4);

/** Albedo alpha at (u, v): what a cutout part's alpha test reads. */
export function setAlpha(set: SetTextures, level: number, u: number, v: number): number {
  sampleSet(set.albedo, level, u, v, SRGB_LUT, texel);
  return texel[3] ?? 1;
}
