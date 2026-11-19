// Stamp a supplied PNG into a cell canvas: bilinear resample to the cell, flipped so the image's
// top row lands at world-up (high V, where box/planar put a face's top). Flat relief, the
// recipe-free roughness default; the image's own colour is kept (vertex colour still multiplies).
// Colour is interpolated premultiplied by alpha, then un-premultiplied, so a transparent texel's
// (often black) colour never bleeds a dark fringe into the edge; where the four alphas are equal
// (an opaque image) the plain interpolation runs and keeps its bytes.

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
      const q = [(y0 * img.width + x0) * 4, (y0 * img.width + x1) * 4];
      q.push((y1 * img.width + x0) * 4, (y1 * img.width + x1) * 4);
      // Bilinear of channel k, each corner scaled by `w` (its alpha when premultiplying).
      const bil = (k: number, w: (o: number) => number): number => {
        const v = q.map((o) => (img.data[o + k] ?? 0) * w(o));
        const top = (v[0] ?? 0) + ((v[1] ?? 0) - (v[0] ?? 0)) * fx;
        const bottom = (v[2] ?? 0) + ((v[3] ?? 0) - (v[2] ?? 0)) * fx;
        return top + (bottom - top) * fy;
      };
      const one = (): number => 1;
      const alphaOf = (o: number): number => img.data[o + 3] ?? 0;
      const alpha = bil(3, one);
      const even = q.every((o) => alphaOf(o) === alphaOf(q[0] ?? 0));
      const o = (y * c.w + x) * 4;
      for (let k = 0; k < 3; k++)
        out[o + k] = Math.round(
          even || alpha <= 0 ? bil(k, one) : Math.min(255, bil(k, alphaOf) / alpha),
        );
      out[o + 3] = Math.round(alpha);
    }
  }
  c.rgba = out;
  c.height.fill(0);
  c.rough.fill(STAMP_ROUGHNESS);
  c.metal.fill(0);
}
