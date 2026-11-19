// LOD strip: LOD0 · LOD1 · LOD2 beauty renders side by side from ONE camera (framed on LOD0), so
// popping — a silhouette that jumps, a part that vanishes, a colour that shifts — reads at a glance.
// Each panel is labelled with the triangles its GLB would hold, so the label agrees with the
// manifest: degenerate and duplicate triangles the recipe emitted are not in the file.

import { type CompiledAsset, encodePng } from '../core/index.ts';
import { optimize } from '../passes/index.ts';
import { type BeautyOptions, renderBeauty } from './beauty.ts';
import { drawText } from './font.ts';

export interface LodStripOptions extends Omit<BeautyOptions, 'frameFrom' | 'window'> {}

/**
 * Triangles of a compiled LOD that survive the exporter's weld (passes `optimize`: zero-area and
 * exact-duplicate triangles go). Counted per part, as render cannot run export's per-pivot merge
 * (same tier): a triangle two parts of one pivot both emit is counted twice here, once in the file.
 */
export const exportedTriangles = (a: CompiledAsset): number =>
  a.parts.reduce(
    (s, p) =>
      p.mesh && p.mesh.indices.length > 0
        ? s + optimize(p.mesh, { vertexCache: false }).report.trianglesAfter
        : s,
    0,
  );

export function lodStrip(lods: readonly CompiledAsset[], o: LodStripOptions = {}): Uint8Array {
  const w = o.width ?? 640;
  const h = o.height ?? 480;
  const first = lods[0];
  const n = lods.length;
  const out = new Uint8Array(w * n * h * 4);
  lods.forEach((a, k) => {
    const r = renderBeauty(a, {
      ...o,
      width: w,
      height: h,
      ...(first ? { frameFrom: first } : {}),
    });
    for (let y = 0; y < h; y++)
      out.set(r.rgba.subarray(y * w * 4, (y + 1) * w * 4), (y * w * n + k * w) * 4);
    if (k > 0)
      for (let y = 0; y < h; y++)
        out.fill(255, (y * w * n + k * w) * 4, (y * w * n + k * w + 2) * 4);
    drawText(
      out,
      w * n,
      k * w + 12,
      12,
      `LOD${a.lod}  ${exportedTriangles(a)} TRIS`,
      3,
      [40, 44, 52],
    );
  });
  return encodePng(w * n, h, out);
}
