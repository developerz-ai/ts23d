// ORM + albedo packing. Occlusion comes from the height cavity (blurred height minus height: deep
// where a texel sits below its surroundings — mortar, seams, grain); roughness and metalness are
// the painted layers. Albedo is the linear tone, sRGB-encoded, with a mild cavity darkening baked
// in so engines that ignore the occlusion map still read the joints.

import type { Canvas } from './canvas.ts';

/** Depth (metres) below the local mean that counts as fully occluded. */
const AO_DEPTH = 0.006;
const AO_STRENGTH = 0.75;
/** Blur radius of the cavity estimate, metres. */
const AO_RADIUS = 0.02;

/** Separable sliding-window box blur: O(1) per texel. Wraps along x when `wrap`, else clamps. */
function boxBlur(
  src: Float32Array,
  w: number,
  h: number,
  rx: number,
  ry: number,
  wrap: boolean,
): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const ix = (i: number): number =>
    i < 0 ? (wrap ? (i % w) + w : 0) : i >= w ? (wrap ? i % w : w - 1) : i;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let k = -rx; k <= rx; k++) s += src[row + ix(k)] ?? 0;
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * rx + 1);
      s += (src[row + ix(x + rx + 1)] ?? 0) - (src[row + ix(x - rx)] ?? 0);
    }
  }
  const iy = (j: number): number => (j < 0 ? 0 : j >= h ? h - 1 : j);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -ry; k <= ry; k++) s += tmp[iy(k) * w + x] ?? 0;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (2 * ry + 1);
      s += (tmp[iy(y + ry + 1) * w + x] ?? 0) - (tmp[iy(y - ry) * w + x] ?? 0);
    }
  }
  return out;
}

/** Per-texel ambient occlusion in [1 - AO_STRENGTH, 1]. */
export function cavityOcclusion(c: Canvas): Float32Array {
  const rx = Math.max(1, Math.round(AO_RADIUS / (c.metresU / c.w)));
  const ry = Math.max(1, Math.round(AO_RADIUS / (c.metresV / c.h)));
  const blur = boxBlur(boxBlur(c.height, c.w, c.h, rx, ry, c.wrapU), c.w, c.h, rx, ry, c.wrapU);
  const ao = new Float32Array(c.height.length);
  for (let i = 0; i < ao.length; i++) {
    const cavity = (blur[i] ?? 0) - (c.height[i] ?? 0);
    const t = cavity <= 0 ? 0 : cavity >= AO_DEPTH ? 1 : cavity / AO_DEPTH;
    ao[i] = (1 - AO_STRENGTH * t) * (c.occl[i] ?? 1);
  }
  return ao;
}

export const SRGB = new Uint8Array(4096).map((_, i) => {
  const l = i / 4095;
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
});

const byte = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255));

/** RGBA8 ORM: R = occlusion, G = roughness, B = metalness, A = 255. */
export function packOrm(c: Canvas, ao: Float32Array): Uint8Array {
  const out = new Uint8Array(c.w * c.h * 4);
  for (let i = 0, o = 0; i < ao.length; i++, o += 4) {
    out[o] = byte(ao[i] ?? 1);
    out[o + 1] = byte(c.rough[i] ?? 0.8);
    out[o + 2] = byte(c.metal[i] ?? 0);
    out[o + 3] = 255;
  }
  return out;
}

/** RGBA8 sRGB albedo: the stamped image if any, else grey tone × mild cavity. */
export function packAlbedo(c: Canvas, ao: Float32Array): Uint8Array {
  if (c.rgba) return c.rgba;
  const out = new Uint8Array(c.w * c.h * 4);
  for (let i = 0, o = 0; i < ao.length; i++, o += 4) {
    const t = (c.tone[i] ?? 1) * (0.8 + 0.2 * (ao[i] ?? 1));
    const g = SRGB[t <= 0 ? 0 : t >= 1 ? 4095 : Math.round(t * 4095)] ?? 255;
    out[o] = g;
    out[o + 1] = g;
    out[o + 2] = g;
    out[o + 3] = 255;
  }
  return out;
}
