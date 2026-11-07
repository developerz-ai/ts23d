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
