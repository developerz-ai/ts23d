// Finish a region canvas (AO, normal, ORM, albedo) and blit it into the sheet. Edge texels are
// replicated `pad` deep (rows for strips, rows + columns for cells) so the first mip levels never
// sample a neighbouring region.

import type { Canvas } from './canvas.ts';
import { sobelNormals } from './normal.ts';
import { cavityOcclusion, packAlbedo, packOrm } from './orm.ts';
import type { PaintedSheet } from './types.ts';

/** An empty sheet: white albedo (vertex colour reads true), flat normal, AO 1, rough 0.8. */
export function blankSheet(size: number): PaintedSheet {
  const n = size * size * 4;
  const albedo = new Uint8Array(n).fill(255);
  const normal = new Uint8Array(n);
  const orm = new Uint8Array(n);
  const flat = new Uint8Array([128, 128, 255, 255]);
  const base = new Uint8Array([255, 204, 0, 255]);
  for (let i = 0; i < n; i += 4) {
    normal.set(flat, i);
    orm.set(base, i);
  }
  return { size, albedo, normal, orm };
}

export function composeRegion(
  sheet: PaintedSheet,
  c: Canvas,
  x0: number,
  y0: number,
  pad: number,
): void {
  const ao = cavityOcclusion(c);
  const maps = [
    [sheet.albedo, packAlbedo(c, ao)],
    [sheet.normal, sobelNormals(c)],
    [sheet.orm, packOrm(c, ao)],
  ] as const;
  const padX = c.wrapU ? 0 : pad;
  for (let y = 0; y < c.h; y++) {
    const sy = Math.min(c.h - 1 - pad, Math.max(pad, y));
    const dst = ((y0 + y) * sheet.size + x0) * 4;
    const src = sy * c.w;
    const l = (src + padX) * 4;
    const r = (src + c.w - 1 - padX) * 4;
    for (const [to, from] of maps) {
      to.set(from.subarray(l, r + 4), dst + padX * 4);
      for (let x = 0; x < padX; x++) {
        to.set(from.subarray(l, l + 4), dst + x * 4);
        to.set(from.subarray(r, r + 4), dst + (c.w - 1 - x) * 4);
      }
    }
  }
}
