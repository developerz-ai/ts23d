// True-scale UV mapping onto the trim sheet. U tiles across a strip through the REPEAT sampler
// (metres / rect.metres); V cannot wrap (the next strip sits there), so V maps one strip band of
// `vMetres` world metres onto the rect, half a texel inside its edges against bleeding.

import { DEFAULT_SHEET, type StripId, TRIM_SHEET_SIZE, type UvRect } from '../material/index.ts';

/** Half a texel at the house sheet size: keeps bilinear samples inside the region. */
export const HALF_TEXEL = 0.5 / TRIM_SHEET_SIZE;

/** World metres one strip band covers along V on the house sheet (`scaleMetres`). */
export const stripVMetres = (id: StripId): number => DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;

/** U for a run of `metres` along the strip. */
export const stripU = (rect: UvRect, metres: number): number =>
  rect.u0 + (metres / rect.metres) * (rect.u1 - rect.u0);

/** V for a fraction 0..1 of one band. */
export const stripV = (rect: UvRect, frac: number): number =>
  rect.v0 + HALF_TEXEL + frac * (rect.v1 - rect.v0 - 2 * HALF_TEXEL);

/** V for any metre value, mirrored every band: continuous, never leaves the strip (organic). */
export function mirroredV(rect: UvRect, metres: number, vMetres: number): number {
  const t = metres / vMetres;
  const m = t - 2 * Math.floor(t / 2);
  return stripV(rect, m <= 1 ? m : 2 - m);
}

/**
 * Band fractions for one flat face from its vertices' heights in band units. V cannot wrap inside
 * a face (the next strip sits there), and wrapping each vertex alone collapsed a face exactly one
 * band tall and ran one crossing a band edge backwards. A face inside one band keeps its phase
 * (and its historical bytes); any other starts at 0 and, when taller than a band, is squeezed
 * onto it: monotonic either way. Tile taller faces at true scale with `tiled`.
 */
export function faceBand(heights: readonly number[]): (height: number) => number {
  const lo = Math.min(...heights);
  const hi = Math.max(...heights);
  const top = Math.floor(lo) + 1;
  if (hi <= top) return (h) => (h === top ? 1 : ((h % 1) + 1) % 1);
  const span = Math.max(1, hi - lo);
  return (h) => (h - lo) / span;
}
