// Colour plumbing for the finish layer: sRGB ↔ linear, bilinear sheet sampling (U repeats, V
// clamps, as the trim sheet's sampler), and CIE Lab for palette drift. Pure functions.

import type { PaintedSheet } from '../material/index.ts';

const TO_LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

export const srgbToLin = (b: number): number =>
  TO_LIN[Math.max(0, Math.min(255, Math.round(b)))] ?? 0;

export function linToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
}

/** Bilinear RGBA sample (0..255 floats) of a square RGBA8 map: U wraps, V clamps. */
export function sampleMap(
  map: Uint8Array,
  size: number,
  u: number,
  v: number,
  out: Float32Array,
): void {
  const x = (u - Math.floor(u)) * size - 0.5;
  const y = Math.max(0, Math.min(size - 1, v * size - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const y1 = Math.min(size - 1, y0 + 1);
  const xa = ((x0 % size) + size) % size;
  const xb = (xa + 1) % size;
  for (let k = 0; k < 4; k++) {
    const p = (r: number, c: number): number => map[(r * size + c) * 4 + k] ?? 0;
    const top = p(y0, xa) * (1 - fx) + p(y0, xb) * fx;
    const bot = p(y1, xa) * (1 - fx) + p(y1, xb) * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }
}

/** Base colour sRGB 0..255: linear vertex colour × the sheet's sRGB albedo (white without a sheet). */
export function baseColour(
  vc: readonly [number, number, number],
  sheet: PaintedSheet | undefined,
  u: number,
  v: number,
  tmp: Float32Array,
): [number, number, number] {
  if (sheet) sampleMap(sheet.albedo, sheet.size, u, v, tmp);
  else tmp.fill(255);
  return [0, 1, 2].map((k) => linToSrgb((vc[k] ?? 1) * srgbToLin(tmp[k] ?? 255))) as [
    number,
    number,
    number,
  ];
}

/** CIE L*a*b* (D65) of an sRGB 0..255 colour. */
export function lab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = f(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export const deltaE = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
