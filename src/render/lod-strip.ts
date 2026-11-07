// LOD strip: LOD0 · LOD1 · LOD2 beauty renders side by side from ONE camera (framed on LOD0), so
// popping — a silhouette that jumps, a part that vanishes, a colour that shifts — reads at a glance.

import { type CompiledAsset, encodePng } from '../core/index.ts';
import { type BeautyOptions, renderBeauty } from './beauty.ts';
import { drawText } from './font.ts';

export interface LodStripOptions extends Omit<BeautyOptions, 'frameFrom' | 'window'> {}

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

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
    drawText(out, w * n, k * w + 12, 12, `LOD${a.lod}  ${tris(a)} TRIS`, 3, [40, 44, 52]);
  });
  return encodePng(w * n, h, out);
}
