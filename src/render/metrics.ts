// Image metrics an agent gets without any model: orthographic silhouette masks per contact-sheet
// view, coverage and bounding-box fill, silhouette IoU (LOD0 ↔ LOD2 = LOD popping; model ↔ photo
// mask = photo match), and the hero's exposure — mean, contrast, crushed blacks, blown whites.

import { type CompiledAsset, Ts23dError } from '../core/index.ts';
import { depthMap, fitFrame, type MapFrame } from './depth-map.ts';
import type { View } from './raster.ts';
import { sceneOf } from './scene.ts';

export interface Silhouette {
  readonly size: number;
  /** 1 = asset, 0 = empty. */
  readonly mask: Uint8Array;
}

export interface MaskStats {
  /** Fraction of the image the silhouette covers. */
  readonly coverage: number;
  /** Fraction of the silhouette's own bounding box it fills (low = spindly or scattered). */
  readonly bboxFill: number;
}

const towardCamera = (v: View): [number, number, number] => {
  const l = Math.hypot(v.dir[0], v.dir[1], v.dir[2]) || 1;
  return [-v.dir[0] / l, -v.dir[1] / l, -v.dir[2] / l];
};

/** The frame that fits `asset` seen along `view` — pass it to silhouettes of other LODs. */
export function viewFrame(asset: CompiledAsset, view: View): MapFrame {
  return fitFrame(sceneOf(asset), towardCamera(view));
}

export function silhouette(
  asset: CompiledAsset,
  view: View,
  size = 256,
  frame: MapFrame = viewFrame(asset, view),
): Silhouette {
  const m = depthMap(sceneOf(asset), towardCamera(view), size, frame);
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i++) mask[i] = (m.data[i] ?? -Infinity) > -Infinity ? 1 : 0;
  return { size, mask };
}

/** Intersection over union of two same-sized masks (nonzero = inside). Two empty masks → 1. */
export function maskIoU(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length)
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `masks differ in size (${a.length} vs ${b.length} pixels)`,
      fix: 'render both silhouettes at the same size and frame (pass the LOD0 frame to both)',
    });
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const x = (a[i] ?? 0) !== 0;
    const y = (b[i] ?? 0) !== 0;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union === 0 ? 1 : inter / union;
}

/** Max-pool a mask by `f` (any covered texel covers the block): the silhouette as seen from afar,
 * where lattice gaps and leaf holes close up — what LOD2 has to match. */
export function poolMask(s: Silhouette, f: number): Silhouette {
  const size = Math.floor(s.size / f);
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < s.size; y++)
    for (let x = 0; x < s.size; x++)
      if (s.mask[y * s.size + x]) {
        const i = Math.floor(y / f) * size + Math.floor(x / f);
        if (i < mask.length) mask[i] = 1;
      }
  return { size, mask };
}

export function maskStats(s: Silhouette): MaskStats {
  let n = 0;
  let x0 = s.size;
  let y0 = s.size;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < s.size; y++)
    for (let x = 0; x < s.size; x++) {
      if (!s.mask[y * s.size + x]) continue;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const box = x1 < 0 ? 0 : (x1 - x0 + 1) * (y1 - y0 + 1);
  return { coverage: n / (s.size * s.size), bboxFill: box ? n / box : 0 };
}

export interface ExposureStats {
  /** Fraction of the frame the asset covers. */
  readonly coverage: number;
  /** The asset's screen bounding box as a fraction of the frame, larger axis (≈ 0.8 when framed). */
  readonly span: number;
  /** Mean relative luminance (0–1, sRGB-encoded values) over asset pixels. */
  readonly mean: number;
  /** Standard deviation of that luminance — low = flat, unreadable shading. */
  readonly contrast: number;
  readonly nearBlack: number;
  readonly nearWhite: number;
}

/** Exposure of a rendered RGBA image (`width` px wide) over the pixels where `mask` ≥ 128. */
export function exposure(rgba: Uint8Array, mask: Uint8Array, width: number): ExposureStats {
  const height = Math.max(1, Math.floor(mask.length / Math.max(1, width)));
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;
  let n = 0;
  let sum = 0;
  let sq = 0;
  let black = 0;
  let white = 0;
  for (let i = 0; i < mask.length; i++) {
    if ((mask[i] ?? 0) < 128) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const o = i * 4;
    const l =
      (0.2126 * (rgba[o] ?? 0) + 0.7152 * (rgba[o + 1] ?? 0) + 0.0722 * (rgba[o + 2] ?? 0)) / 255;
    n++;
    sum += l;
    sq += l * l;
    if (l < 0.06) black++;
    if (l > 0.97) white++;
  }
  const mean = n ? sum / n : 0;
  return {
    coverage: n / Math.max(1, mask.length),
    span: x1 < 0 ? 0 : Math.max((x1 - x0 + 1) / width, (y1 - y0 + 1) / height),
    mean,
    contrast: n ? Math.sqrt(Math.max(0, sq / n - mean * mean)) : 0,
    nearBlack: n ? black / n : 0,
    nearWhite: n ? white / n : 0,
  };
}
