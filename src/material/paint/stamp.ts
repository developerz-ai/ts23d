// Stamp a supplied PNG into a cell canvas: bilinear resample to the cell, flipped so the image's
// top row lands at world-up (high V, where box/planar put a face's top). Flat relief, the
// recipe-free roughness default; the image's own colour is kept (vertex colour still multiplies).

import type { Canvas } from './canvas.ts';
import { decodePng } from './decode-png.ts';

export const STAMP_ROUGHNESS = 0.6;

export function stampImage(c: Canvas, png: Uint8Array): void {
  const img = decodePng(png);
  const out = new Uint8Array(c.w * c.h * 4);
  for (let y = 0; y < c.h; y++) {
    const sy = Math.min(
      img.height - 1,
      Math.max(0, ((c.h - 1 - y + 0.5) / c.h) * img.height - 0.5),
    );
    const y0 = Math.floor(sy);
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < c.w; x++) {
      const sx = Math.min(img.width - 1, Math.max(0, ((x + 0.5) / c.w) * img.width - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = sx - x0;
      for (let k = 0; k < 4; k++) {
        const a = img.data[(y0 * img.width + x0) * 4 + k] ?? 0;
        const b = img.data[(y0 * img.width + x1) * 4 + k] ?? 0;
        const d = img.data[(y1 * img.width + x0) * 4 + k] ?? 0;
        const e = img.data[(y1 * img.width + x1) * 4 + k] ?? 0;
        const top = a + (b - a) * fx;
        out[(y * c.w + x) * 4 + k] = Math.round(top + (d + (e - d) * fx - top) * fy);
      }
    }
  }
  c.rgba = out;
  c.height.fill(0);
  c.rough.fill(STAMP_ROUGHNESS);
  c.metal.fill(0);
}
