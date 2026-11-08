// The art metrics as pictures for the critique pack: a 32-px silhouette strip (LOD0 vs LOD2 per
// view), a greyscale value map with the hottest contrast and the focal region marked, and a
// detail-density heatmap (calm vs busy cells). RGBA buffers; the CLI encodes them as PNG.

import { partMatcher } from './critique-art.ts';
import type { ArtMaps } from './critique-metrics.ts';

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const BG = [236, 236, 232] as const;
type Rgb = readonly [number, number, number];

const put = (img: Uint8Array, i: number, c: Rgb): void => {
  img[i * 4] = c[0];
  img[i * 4 + 1] = c[1];
  img[i * 4 + 2] = c[2];
  img[i * 4 + 3] = 255;
};

/** Per view: dark = both LODs, red = LOD0 only (lost at LOD2), blue = LOD2 only, by coverage; ×6. */
export function silhouetteStrip(maps: Pick<ArtMaps, 'near' | 'far'>, scale = 6): RgbaImage {
  const size = maps.near[0]?.size ?? 32;
  const tile = size * scale;
  const gap = 8;
  const n = maps.near.length;
  const width = n * tile + (n + 1) * gap;
  const height = tile + 2 * gap;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) put(rgba, i, BG);
  maps.near.forEach((a, k) => {
    const b = maps.far[k];
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const j = Math.floor(y / scale) * size + Math.floor(x / scale);
        const p = a.data[j] === 1;
        const q = b?.data[j] === 1;
        const c: Rgb =
          p && q ? [40, 40, 44] : p ? [214, 48, 49] : q ? [41, 98, 255] : [255, 255, 255];
        put(rgba, (y + gap) * width + gap + k * (tile + gap) + x, c);
      }
  });
  return { width, height, rgba };
}

/** Greyscale value; hottest 5 % contrast in orange; declared focal part(s) outlined green; peak
 * boxed red. */
export function valueMap(
  maps: Pick<ArtMaps, 'lum' | 'buf' | 'focal'>,
  focal: readonly string[],
): RgbaImage {
  const { width, height, part, names } = maps.buf;
  const rgba = new Uint8Array(width * height * 4);
  const isFocal = partMatcher(focal);
  const foc = (i: number): boolean => focal.length > 0 && isFocal(names[part[i] ?? -1] ?? '\0');
  for (let i = 0; i < width * height; i++) {
    const l = maps.lum[i] ?? Number.NaN;
    if (!Number.isFinite(l)) {
      put(rgba, i, BG);
      continue;
    }
    const g = Math.round(l * 255);
    put(rgba, i, maps.focal.hot[i] ? [255, Math.round(120 + g / 3), 0] : [g, g, g]);
  }
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (foc(i) && (!foc(i - 1) || !foc(i + 1) || !foc(i - width) || !foc(i + width)))
        put(rgba, i, [0, 200, 80]);
    }
  // Peak: a 2-px red box around the densest hot cluster.
  const r = Math.max(6, Math.round(height / 20));
  const [px, py] = maps.focal.peak;
  for (let t = -r; t <= r; t++)
    for (let w = 0; w < 2; w++)
      for (const [x, y] of [
        [px + t, py - r - w],
        [px + t, py + r + w],
        [px - r - w, py + t],
        [px + r + w, py + t],
      ] as const)
        if (x >= 0 && y >= 0 && x < width && y < height) put(rgba, y * width + x, [230, 0, 30]);
  return { width, height, rgba };
}

/** Detail per cell: calm (< 1) cool blue-green, busy warm orange → red at 2×; shaded by value. */
export function detailHeatmap(maps: Pick<ArtMaps, 'lum' | 'buf' | 'rest'>): RgbaImage {
  const { width, height } = maps.buf;
  const { cell, cols, detail } = maps.rest;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const l = maps.lum[i] ?? Number.NaN;
      const d = detail[Math.floor(y / cell) * cols + Math.floor(x / cell)] ?? Number.NaN;
      if (!Number.isFinite(l)) {
        put(rgba, i, BG);
        continue;
      }
      const k = 0.55 + 0.45 * l;
      const c: Rgb = !Number.isFinite(d)
        ? [150, 150, 150]
        : d < 1
          ? [40 + 60 * d, 140 + 40 * d, 170 - 40 * d]
          : [240, Math.max(30, 190 - 160 * (Math.min(2, d) - 1)), 40];
      put(rgba, i, [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)]);
    }
  return { width, height, rgba };
}
