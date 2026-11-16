// Part-ID masks: every pixel names the part in front (z-buffered), rendered from any camera that
// projects to pixels — the orthographic contact-sheet cameras or a concept image's solved camera
// (camera-solve.ts). Split-part generation (finish/split-parts.ts) crops the concept per part with
// them; masks are also what the silhouette sheet and per-part texture projection read.

import type { CompiledAsset, Vec3 } from '../core/index.ts';
import { type Camera, worldParts } from './raster.ts';

export interface PartMasks {
  readonly width: number;
  readonly height: number;
  /** Part index per pixel into `parts`, −1 = background. */
  readonly ids: Int16Array;
  readonly parts: readonly string[];
}

export function partMasks(
  asset: CompiledAsset,
  cam: Camera,
  width: number,
  height: number,
): PartMasks {
  const ids = new Int16Array(width * height).fill(-1);
  const depth = new Float32Array(width * height).fill(Infinity);
  const meshes = worldParts(asset);
  const names = asset.parts.filter((p) => p.mesh).map((p) => p.name);
  meshes.forEach((m, id) => {
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => {
        const v = (m.indices[i + k] ?? 0) * 3;
        return cam.project([m.positions[v] ?? 0, m.positions[v + 1] ?? 0, m.positions[v + 2] ?? 0]);
      }) as [Vec3, Vec3, Vec3];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
      const x1 = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
      const y1 = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const [px, py] = [x + 0.5, y + 0.5];
          const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
          const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
          const k = y * width + x;
          if (z >= (depth[k] ?? Infinity)) continue;
          depth[k] = z;
          ids[k] = id;
        }
    }
  });
  return { width, height, ids, parts: names };
}

/** Pixel box [x0, y0, x1, y1] (inclusive) of a part's mask grown by `margin` × its size, or null. */
export function partBox(
  m: PartMasks,
  part: string,
  margin = 0.1,
): readonly [number, number, number, number] | null {
  const id = m.parts.indexOf(part);
  let [x0, y0, x1, y1] = [m.width, m.height, -1, -1];
  for (let k = 0; k < m.ids.length; k++)
    if (m.ids[k] === id) {
      const x = k % m.width;
      const y = Math.floor(k / m.width);
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
  if (id < 0 || x1 < 0) return null;
  const gx = Math.round((x1 - x0 + 1) * margin);
  const gy = Math.round((y1 - y0 + 1) * margin);
  return [
    Math.max(0, x0 - gx),
    Math.max(0, y0 - gy),
    Math.min(m.width - 1, x1 + gx),
    Math.min(m.height - 1, y1 + gy),
  ];
}
