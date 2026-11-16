// Fit a model's PNG to the size a request asked for: hosted image models pick their own output
// size (an aspect ratio and a "1K/2K" class), the `image` task promises `width × height`. Centre-
// crop to the asked aspect, then area-average down (or nearest up) and re-encode. Deterministic:
// same bytes in, same bytes out. A reply that is not a PNG is T3D_NEURAL_OUTPUT_INVALID.

import { encodePng, Ts23dError } from '../core/index.ts';
import { readPng } from './png-read.ts';

export function fitPng(bytes: Uint8Array, width: number, height: number, what: string): Uint8Array {
  const img = ((): { width: number; height: number; data: Uint8Array } => {
    try {
      return readPng(bytes, what);
    } catch (e) {
      throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', {
        cause: `${what} does not decode as PNG (${e instanceof Error ? e.message : String(e)})`,
        fix: 'ask the service for output_format png',
      });
    }
  })();
  if (img.width === width && img.height === height) return bytes;
  // Centre crop to the target aspect.
  const want = width / height;
  let cw = img.width;
  let ch = img.height;
  if (cw / ch > want) cw = Math.max(1, Math.round(ch * want));
  else ch = Math.max(1, Math.round(cw / want));
  const x0 = Math.floor((img.width - cw) / 2);
  const y0 = Math.floor((img.height - ch) / 2);
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx0 = x0 + Math.floor((x * cw) / width);
      const sy0 = y0 + Math.floor((y * ch) / height);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor(((x + 1) * cw) / width));
      const sy1 = Math.max(sy0 + 1, y0 + Math.floor(((y + 1) * ch) / height));
      const acc = [0, 0, 0, 0];
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++)
          for (let k = 0; k < 4; k++)
            acc[k] = (acc[k] ?? 0) + (img.data[(sy * img.width + sx) * 4 + k] ?? 0);
      const n = (sx1 - sx0) * (sy1 - sy0);
      for (let k = 0; k < 4; k++) out[(y * width + x) * 4 + k] = Math.round((acc[k] ?? 0) / n);
    }
  return encodePng(width, height, out);
}
