// The trim sheet as the contact sheet reads it, per pixel (D452): `albedoAt` samples the albedo
// mip the triangle's footprint picks, bilinearly, at the pixel's own UV, with the sample clamped
// inside the strip row (or cell) the UV is in, so a 1/64 strip row never bleeds into its
// neighbour. When that mip is too coarse to hold two texel rows of the strip, the sample is the
// row's (or cell's) MEAN linear albedo instead: exact, noise-free, independent of U (strips tile
// along U) and what the texture converges to at a distance. Means and mips are alpha-weighted, so
// a cutout strip or leaf cell gives the colour of its visible texels. The silhouette of a cutout
// card is the per-pixel alpha test `cutAt` against the sheet's own texels (D300).

import type { CompiledAsset } from '../core/index.ts';
import {
  DEFAULT_SHEET,
  liveSheet,
  type PaintedSheet,
  STRIP_H,
  STRIP_ROWS,
  sheetFor,
} from '../material/index.ts';
import { chain, type Mip, SHEET_CELLS, SRGB, sample, sheetRegion } from './texture.ts';

/** Cells per sheet row (1/16 of the sheet each), in the rows above the strips. */
const CELLS = SHEET_CELLS;
const CELL_ROWS = Math.round((1 - STRIP_ROWS * STRIP_H) * CELLS);

export interface SheetTones {
  /** Linear RGB per strip row, 3 floats each. */
  readonly strips: Float32Array;
  /** Linear RGB per cell, row-major from the first cell row, 3 floats each. */
  readonly cells: Float32Array;
  /** The sheet the means came from: its albedo alpha is the cutout mask. */
  readonly sheet: PaintedSheet;
  /** Linear albedo (alpha-weighted, coverage-keeping) mip chain of `sheet`. */
  readonly albedo: readonly Mip[];
}

/** Alpha-weighted mean linear colour of texels [x0, x1) × [y0, y1) into out[o..o+2]; white when empty. */
function mean(
  s: PaintedSheet,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  out: Float32Array,
  o: number,
): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  for (let y = y0; y < y1; y++)
    for (let i = (y * s.size + x0) * 4; i < (y * s.size + x1) * 4; i += 4) {
      const a = s.albedo[i + 3] ?? 0;
      r += (SRGB[s.albedo[i] ?? 0] ?? 0) * a;
      g += (SRGB[s.albedo[i + 1] ?? 0] ?? 0) * a;
      b += (SRGB[s.albedo[i + 2] ?? 0] ?? 0) * a;
      w += a;
    }
  out[o] = w > 0 ? r / w : 1;
  out[o + 1] = w > 0 ? g / w : 1;
  out[o + 2] = w > 0 ? b / w : 1;
}

const cache = new WeakMap<PaintedSheet, SheetTones>();

/** The 88 mean colours of `sheet` (one pass over its albedo, cached per sheet). */
export function sheetTones(sheet: PaintedSheet): SheetTones {
  const hit = cache.get(sheet);
  if (hit) return hit;
  const n = sheet.size;
  const strips = new Float32Array(STRIP_ROWS * 3);
  const cells = new Float32Array(CELL_ROWS * CELLS * 3);
  // Texel bounds are floored fractions of the sheet, so a small hand-built sheet works too.
  const at = (f: number): number => Math.min(n, Math.floor(f * n + 1e-6));
  for (let r = 0; r < STRIP_ROWS; r++)
    mean(sheet, 0, n, at(r * STRIP_H), at((r + 1) * STRIP_H), strips, r * 3);
  for (let c = 0; c < CELL_ROWS * CELLS; c++) {
    const cx = (c % CELLS) / CELLS;
    const cy = STRIP_ROWS * STRIP_H + Math.floor(c / CELLS) / CELLS;
    mean(sheet, at(cx), at(cx + 1 / CELLS), at(cy), at(cy + 1 / CELLS), cells, c * 3);
  }
  const albedo = chain(sheet.albedo, n, (c, v) => (c === 3 ? v / 255 : (SRGB[v] ?? 0)), true);
  const t = { strips, cells, sheet, albedo };
  cache.set(sheet, t);
  return t;
}

/** Mean linear albedo of the strip row or cell holding (u, v) into out[0..2]: U wraps, V clamps. */
export function toneAt(t: SheetTones, u: number, v: number, out: Float32Array): void {
  const r = Math.max(0, Math.floor(v / STRIP_H));
  let from = t.strips;
  let o = r * 3;
  if (r >= STRIP_ROWS) {
    const cr = Math.min(CELL_ROWS - 1, Math.floor((v - STRIP_ROWS * STRIP_H) * CELLS));
    from = t.cells;
    o = (cr * CELLS + Math.floor((u - Math.floor(u)) * CELLS)) * 3;
  }
  out[0] = from[o] ?? 1;
  out[1] = from[o + 1] ?? 1;
  out[2] = from[o + 2] ?? 1;
}

const TAP = new Float32Array(4);

/**
 * Linear albedo at (u, v) from mip `level` into out[0..2]: bilinear, clamped half a texel inside
 * the strip row (U wraps) or the cell (U wraps to the sheet, then clamps to the cell) holding
 * (u, v); the row's or cell's mean when that mip has fewer than two texel rows of it.
 */
export function albedoAt(
  t: SheetTones,
  level: number,
  u: number,
  v: number,
  out: Float32Array,
): void {
  const L = Math.max(0, Math.min(t.albedo.length - 1, level));
  const s = t.albedo[L]?.size ?? t.sheet.size;
  if (sheetRegion(u, v).tall * s < 2) {
    toneAt(t, u, v, out);
    return;
  }
  // `sample` keeps the tap inside the strip row or cell holding (u, v).
  sample(t.albedo, L, u, v, TAP);
  out[0] = TAP[0] ?? 1;
  out[1] = TAP[1] ?? 1;
  out[2] = TAP[2] ?? 1;
}

/** Alpha byte under which a cutout texel is dropped (glTF `alphaCutoff` 0.5). */
const CUT = 128;

/**
 * True where a cutout card is cut away at (u, v): the nearest texel's alpha is under the cut.
 * U wraps, V clamps, as the hero samples the sheet. Nearest, not filtered: at the contact sheet's
 * scale a card texel is about a pixel, and a point sample keeps the card's alpha coverage.
 */
export function cutAt(t: SheetTones, u: number, v: number): boolean {
  const n = t.sheet.size;
  const x = Math.floor((u - Math.floor(u)) * n) % n;
  const y = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
  return (t.sheet.albedo[(y * n + x) * 4 + 3] ?? 255) < CUT;
}

const PREVIEW = { ...DEFAULT_SHEET, size: 512 } as const;
const preview = liveSheet(PREVIEW);

/**
 * The default trim sheet at the contact sheet's resolution: 512² (8 px strip rows) paints in
 * about 0.2 s against 2 s at the hero's 2048², and a mean does not need the texels. Pass the
 * compiled asset (and its far LOD): the sheet then holds that asset's own materials (D299).
 * Without one it holds every defined material, repainted when the set moved. The CLI passes
 * this sheet to every `sheet.png` and `thumb.png` it writes, so `shot`, `review` and `critique`
 * agree byte for byte.
 */
export const previewSheet = (assets?: CompiledAsset | readonly CompiledAsset[]): PaintedSheet =>
  assets ? sheetFor(assets, PREVIEW) : preview.current().sheet;
