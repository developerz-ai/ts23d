// Solid silhouette masks for the art metrics: an orthographic part buffer at 4× the target size,
// hole-filled there, then box-filtered to coverage (0–1) — an antialiased thumbnail that compares
// shapes, not lattice gaps or pixel snapping. Plus soft IoU and the views the metrics look from.

import type { CompiledAsset } from '../core/index.ts';
import { orthoCamera, partBuffer } from './critique-raster.ts';

export interface ArtView {
  readonly name: string;
  /** camera.ts convention: 0 = front (+X), −90 = the −Y side. */
  readonly azDeg: number;
  readonly elDeg: number;
}

/** Front, side and the hero 3/4: the three a player reads an asset from. */
export const ART_VIEWS: readonly ArtView[] = [
  { name: 'front', azDeg: 0, elDeg: 0 },
  { name: 'side', azDeg: -90, elDeg: 0 },
  { name: '3/4', azDeg: -35, elDeg: 18 },
];

export interface Mask {
  readonly size: number;
  /** Coverage 0–1 per pixel (1 = asset), row 0 = top. */
  readonly data: Float32Array;
}

const SUPER = 4;

/** `asset`'s solid silhouette from `view` at `size`², framed on `frameFrom` (default itself). */
export function solidMask(
  asset: CompiledAsset,
  view: ArtView,
  size: number,
  frameFrom: CompiledAsset = asset,
): Mask {
  const big = size * SUPER;
  const buf = partBuffer(asset, orthoCamera(frameFrom, view.azDeg, view.elDeg, big));
  const hi = fillHoles({ size: big, data: Float32Array.from(buf.part, (p) => (p >= 0 ? 1 : 0)) });
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let n = 0;
      for (let j = 0; j < SUPER; j++)
        for (let i = 0; i < SUPER; i++) n += hi.data[(y * SUPER + j) * big + x * SUPER + i] ?? 0;
      data[y * size + x] = n / (SUPER * SUPER);
    }
  return { size, data };
}

/** Background (< 0.5) not reachable from the border becomes inside (4-connected flood fill). */
export function fillHoles(m: Mask): Mask {
  const { size } = m;
  const out = m.data.slice();
  const seen = new Uint8Array(size * size);
  const stack: number[] = [];
  const push = (i: number): void => {
    if (!seen[i] && (out[i] ?? 0) < 0.5) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let k = 0; k < size; k++) {
    push(k);
    push((size - 1) * size + k);
    push(k * size);
    push(k * size + size - 1);
  }
  for (let i = stack.pop(); i !== undefined; i = stack.pop()) {
    const x = i % size;
    if (x > 0) push(i - 1);
    if (x < size - 1) push(i + 1);
    if (i >= size) push(i - size);
    if (i < size * (size - 1)) push(i + size);
  }
  for (let i = 0; i < out.length; i++) if (!seen[i]) out[i] = 1;
  return { size, data: out };
}

/** Soft intersection over union, Σ min / Σ max of coverage (two empty masks → 1). */
export function iou(a: Mask, b: Mask): number {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i++) {
    const x = a.data[i] ?? 0;
    const y = b.data[i] ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * Taper: (base width − top width) / the larger, from the mean row widths of the bottom and top
 * quarter of the filled rows. +1 a spike on a wide base (pyramid), 0 a column, −1 top-heavy.
 */
export function taper(m: Mask): number {
  const rows: number[] = [];
  for (let y = 0; y < m.size; y++) {
    let w = 0;
    for (let x = 0; x < m.size; x++) w += m.data[y * m.size + x] ?? 0;
    if (w >= 0.5) rows.push(w);
  }
  if (rows.length < 4) return 0;
  const q = Math.max(1, Math.floor(rows.length / 4));
  const mean = (xs: number[]): number => xs.reduce((s, v) => s + v, 0) / xs.length;
  const top = mean(rows.slice(0, q));
  const base = mean(rows.slice(-q));
  return (base - top) / Math.max(base, top);
}
