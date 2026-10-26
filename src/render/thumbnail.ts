// Thumbnail: ONE hero view (3/4 front, slightly from above) on a transparent background, for
// gallery cards and asset browsers. Rendered at 3×, cropped to the asset, filtered down: smooth edges.
// Same zero-GPU rasteriser as the contact sheet — deterministic bytes, runs in CI.

import { type CompiledAsset, encodePng } from '../core/index.ts';
import { drawAsset, orthoCamera, type Target, type View } from './raster.ts';
import { bounds } from './sheet.ts';

export interface ThumbnailOptions {
  /** Output edge in pixels (square). Default 512. */
  readonly size?: number;
  readonly view?: View;
}

const HERO: View = { label: 'HERO', dir: [-1, 0.75, -0.45], up: [0, 0, 1] };

export function thumbnail(asset: CompiledAsset, o: ThumbnailOptions = {}): Uint8Array {
  const size = o.size ?? 512;
  const big = size * 3;
  const t: Target = {
    px: new Uint8Array(big * big * 4),
    depth: new Float32Array(big * big).fill(Infinity),
    width: big,
    height: big,
  };
  const b = bounds(asset);
  drawAsset(t, orthoCamera(o.view ?? HERO, b.centre, b.extent * 0.92, big), asset);
  // Crop to the drawn pixels (square, 6% margin) so every card is filled the same way.
  let x0 = big;
  let y0 = big;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < big; y++)
    for (let x = 0; x < big; x++)
      if ((t.px[(y * big + x) * 4 + 3] ?? 0) > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const side = x1 < 0 ? big : Math.max(x1 - x0, y1 - y0) * 1.12 + 1;
  const ox = x1 < 0 ? 0 : (x0 + x1) / 2 - side / 2;
  const oy = x1 < 0 ? 0 : (y0 + y1) / 2 - side / 2;
  const step = side / size;
  // Supersampled box filter over each output pixel's footprint; alpha-weighted colour so
  // silhouettes stay clean against any page background.
  const out = new Uint8Array(size * size * 4);
  const taps = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      for (const fy of taps)
        for (const fx of taps) {
          const sx = Math.floor(ox + (x + fx) * step);
          const sy = Math.floor(oy + (y + fy) * step);
          if (sx < 0 || sy < 0 || sx >= big || sy >= big) continue;
          const i = (sy * big + sx) * 4;
          const w = t.px[i + 3] ?? 0;
          r += (t.px[i] ?? 0) * w;
          g += (t.px[i + 1] ?? 0) * w;
          bl += (t.px[i + 2] ?? 0) * w;
          a += w;
        }
      if (a > 0)
        out.set(
          [Math.round(r / a), Math.round(g / a), Math.round(bl / a), Math.round(a / 4)],
          (y * size + x) * 4,
        );
    }
  }
  return encodePng(size, size, out);
}
