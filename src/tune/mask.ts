// Reference masks for the silhouette objective: a PNG (dark or opaque = asset; SVG drawings in
// mask-svg.ts) → a binary mask, and the framing-agnostic compare the image assertions use: crop
// each mask to its bounding box, fit it (aspect kept, centred) into one n×n square, then IoU.

import { type CompiledAsset, Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { maskIoU, silhouette } from '../render/index.ts';
import type { TuneView } from './types.ts';

export interface Mask {
  readonly width: number;
  readonly height: number;
  /** 1 = asset, row 0 = top. */
  readonly data: Uint8Array;
}

/** Camera on the named side looking back at the asset, Z up (as the image assertions). */
export const TUNE_VIEWS: Readonly<
  Record<TuneView, { label: string; dir: [number, number, number]; up: [number, number, number] }>
> = {
  '+X': { label: 'FRONT +X', dir: [-1, 0, 0], up: [0, 0, 1] },
  '-X': { label: 'REAR -X', dir: [1, 0, 0], up: [0, 0, 1] },
  '+Y': { label: 'LEFT +Y', dir: [0, -1, 0], up: [0, 0, 1] },
  '-Y': { label: 'RIGHT -Y', dir: [0, 1, 0], up: [0, 0, 1] },
  '+Z': { label: 'TOP +Z', dir: [0, 0, -1], up: [1, 0, 0] },
  '-Z': { label: 'BOTTOM -Z', dir: [0, 0, 1], up: [1, 0, 0] },
};

/** A PNG mask: alpha ≥ 128 and not near-white = asset. */
export function maskOfPng(bytes: Uint8Array): Mask {
  const img = decodePng(bytes, (cause) => {
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `silhouette mask PNG: ${cause}`,
      fix: 'save the mask as an 8-bit RGBA or greyscale PNG, or draw it as an SVG',
    });
  });
  const data = new Uint8Array(img.width * img.height);
  for (let i = 0; i < data.length; i++) {
    const o = i * 4;
    const lum = ((img.data[o] ?? 0) + (img.data[o + 1] ?? 0) + (img.data[o + 2] ?? 0)) / 3;
    data[i] = (img.data[o + 3] ?? 0) >= 128 && lum < 200 ? 1 : 0;
  }
  return { width: img.width, height: img.height, data };
}

/** Crop to the bounding box and fit (aspect kept, centred) into an n×n mask. */
export function fitMask(m: Mask, n = 128): Uint8Array {
  const { width: w, height: h, data } = m;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x])
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  const out = new Uint8Array(n * n);
  if (x1 < 0) return out;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const s = Math.max(bw, bh) / n;
  const ox = (n - bw / s) / 2;
  const oy = (n - bh / s) / 2;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const sx = Math.floor((x - ox + 0.5) * s) + x0;
      const sy = Math.floor((y - oy + 0.5) * s) + y0;
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out[y * n + x] = data[sy * w + sx] ?? 0;
    }
  return out;
}

/** The asset's outline from `view`, as a Mask. */
export function modelMask(asset: CompiledAsset, view: TuneView, size = 192): Mask {
  const s = silhouette(asset, TUNE_VIEWS[view], size);
  return { width: s.size, height: s.size, data: s.mask };
}

/** IoU of the asset's outline from `view` against a fitted reference (`fitMask(ref, n)`). */
export function silhouetteIoU(
  asset: CompiledAsset,
  view: TuneView,
  ref: Uint8Array,
  n = 128,
): number {
  return maskIoU(fitMask(modelMask(asset, view), n), ref);
}
