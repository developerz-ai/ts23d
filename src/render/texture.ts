// The trim sheet as the renderers sample it: albedo (linear, alpha), tangent-space normal and ORM,
// each as a box-filtered mip chain, sampled bilinearly inside the strip row or cell that holds the
// UV: U repeats along a strip, V is clamped half a texel inside its row (a cell clamps U too), and
// the level never goes coarser than the one holding two texel rows of it. A 2×2 box never
// straddles a row while the row is 2+ texels tall, so no row ever reads its neighbour (D600: a
// plain bilinear tap at a band's edge, at mip 4 of a 2048² sheet, was half `glass` / `oak`). The
// level is chosen per triangle by the caller (texel ÷ pixel footprint). Albedo mips are
// cutout-safe (alpha-mips.ts): thin strands stay strands instead of eroding away.

import { dmath } from '../core/index.ts';
import { type PaintedSheet, STRIP_H, STRIP_ROWS } from '../material/index.ts';
import { keepCoverage, weighted } from './alpha-mips.ts';

/** One level of a mip chain. */
export interface Mip {
  readonly size: number;
  /** 4 floats per texel. */
  readonly data: Float32Array;
}

export interface SheetTextures {
  readonly size: number;
  readonly albedo: readonly Mip[];
  readonly normal: readonly Mip[];
  readonly orm: readonly Mip[];
}

/** sRGB byte → linear. */
export const SRGB = new Float32Array(256).map((_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : dmath.pow((v + 0.055) / 1.055, 2.4);
});

/** RGBA8 → box-filtered float mips down to 4²; `cutout` keeps alpha-tested coverage. */
export function chain(
  src: Uint8Array,
  size: number,
  decode: (c: number, v: number) => number,
  cutout = false,
): Mip[] {
  const top = new Float32Array(size * size * 4);
  for (let i = 0; i < top.length; i++) top[i] = decode(i & 3, src[i] ?? 0);
  const out: Mip[] = [{ size, data: top }];
  let cur = out[0];
  while (cur && cur.size > 4) {
    const s = cur.size / 2;
    const d = new Float32Array(s * s * 4);
    const p = cur.data;
    const w = cur.size;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++)
        for (let c = 0; c < 4; c++) {
          const a = ((2 * y * w + 2 * x) << 2) + c;
          const b = a + w * 4;
          d[((y * s + x) << 2) + c] =
            cutout && c < 3
              ? weighted(p, a, b, c)
              : ((p[a] ?? 0) + (p[a + 4] ?? 0) + (p[b] ?? 0) + (p[b + 4] ?? 0)) * 0.25;
        }
    cur = { size: s, data: d };
    out.push(cur);
  }
  if (cutout) keepCoverage(out);
  return out;
}

const cache = new WeakMap<PaintedSheet, SheetTextures>();

export function sheetTextures(sheet: PaintedSheet): SheetTextures {
  const hit = cache.get(sheet);
  if (hit) return hit;
  const t: SheetTextures = {
    size: sheet.size,
    albedo: chain(sheet.albedo, sheet.size, (c, v) => (c === 3 ? v / 255 : (SRGB[v] ?? 0)), true),
    normal: chain(sheet.normal, sheet.size, (c, v) => (c === 3 ? 1 : v / 127.5 - 1)),
    orm: chain(sheet.orm, sheet.size, (_c, v) => v / 255),
  };
  cache.set(sheet, t);
  return t;
}

/** Cells per sheet row (1/16 of the sheet each), in the rows above the strips. */
export const SHEET_CELLS = 16;
const CELL_V0 = STRIP_ROWS * STRIP_H;
const CELL_ROWS = Math.round((1 - CELL_V0) * SHEET_CELLS);

/** The strip row or cell of the sheet that holds (u, v): its V start and height, and its U start
 *  (undefined for a strip row, which tiles along U). */
export interface SheetRegion {
  readonly v0: number;
  readonly tall: number;
  readonly u0: number | undefined;
}

/** Which strip row (V below the sheet: the first) or cell (above it: the top row) holds (u, v). */
export function sheetRegion(u: number, v: number): SheetRegion {
  const r = Math.max(0, Math.floor(v / STRIP_H));
  if (r < STRIP_ROWS) return { v0: r * STRIP_H, tall: STRIP_H, u0: undefined };
  const cr = Math.min(CELL_ROWS - 1, Math.floor((v - CELL_V0) * SHEET_CELLS));
  const cu = Math.floor((u - Math.floor(u)) * SHEET_CELLS);
  return { v0: CELL_V0 + cr / SHEET_CELLS, tall: 1 / SHEET_CELLS, u0: cu / SHEET_CELLS };
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Sample the trim sheet's mip `level` at (u, v) into out[0..3]: bilinear inside the strip row or
 * cell holding (u, v), at most as coarse as the level that keeps two texel rows of it.
 */
export function sample(
  mips: readonly Mip[],
  level: number,
  u: number,
  v: number,
  out: Float32Array,
): void {
  const { v0, tall, u0 } = sheetRegion(u, v);
  let L = clamp(level, 0, mips.length - 1);
  while (L > 0 && tall * (mips[L]?.size ?? 0) < 2) L--;
  const half = 0.5 / (mips[L]?.size ?? 1);
  const su = u0 === undefined ? u : clamp(u - Math.floor(u), u0 + half, u0 + tall - half);
  bilinear(mips, L, su, clamp(v, v0 + half, v0 + tall - half), out);
}

/** Bilinear sample of mip `level` at (u, v) into out[0..3]: U repeats, V clamps to the image. */
function bilinear(
  mips: readonly Mip[],
  level: number,
  u: number,
  v: number,
  out: Float32Array,
): void {
  const m = mips[Math.min(mips.length - 1, Math.max(0, level))] ?? mips[0];
  if (!m) return;
  const s = m.size;
  const x = u * s - 0.5;
  const y = Math.min(s - 1, Math.max(0, v * s - 0.5));
  const xf = Math.floor(x);
  const yf = Math.floor(y);
  const fx = x - xf;
  const fy = y - yf;
  const x0 = ((xf % s) + s) % s;
  const x1 = (x0 + 1) % s;
  const y0 = yf;
  const y1 = Math.min(s - 1, yf + 1);
  const d = m.data;
  const a = (y0 * s + x0) << 2;
  const b = (y0 * s + x1) << 2;
  const c = (y1 * s + x0) << 2;
  const e = (y1 * s + x1) << 2;
  const w0 = (1 - fx) * (1 - fy);
  const w1 = fx * (1 - fy);
  const w2 = (1 - fx) * fy;
  const w3 = fx * fy;
  for (let k = 0; k < 4; k++)
    out[k] =
      (d[a + k] ?? 0) * w0 + (d[b + k] ?? 0) * w1 + (d[c + k] ?? 0) * w2 + (d[e + k] ?? 0) * w3;
}
