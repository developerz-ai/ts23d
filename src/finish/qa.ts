// Finish QA: reject a finish that changes what the asset IS rather than how it is weathered.
//   T3D_FINISH_PALETTE_DRIFT — a part's mean colour (CIE Lab) moved more than `maxDeltaE` from its
//     declared base colour (vertex colour × trim): the model repainted it.
//   T3D_FINISH_MASK_LEAK — colour crossed part boundaries: baked weight that came from another
//     part's pixels (0 with masking on), or a view whose image paints outside the silhouette (a
//     model that ignored the control maps: misaligned, the bake would smear it onto the wrong place).

import type { Projection } from './bake.ts';
import { deltaE, lab } from './colour.ts';
import type { Texels } from './texels.ts';
import type { ControlViews, FinishFinding } from './types.ts';

export interface FinishQaOptions {
  /** Max ΔE76 of a part's mean colour vs its base. Default 25 (weathering, not a repaint). */
  readonly maxDeltaE?: number;
  /** Max share of a part's baked weight from other parts' pixels. Default 0.02. */
  readonly maxLeak?: number;
  /** Max share of the 2-px ring around the silhouette painted by the model. Default 0.2. */
  readonly maxRing?: number;
}

export function paletteDrift(
  t: Texels,
  albedo: Uint8Array,
  parts: number,
): { base: number[][]; finished: number[][]; drift: number[] } {
  const sb = new Float64Array(parts * 3);
  const sf = new Float64Array(parts * 3);
  const n = new Float64Array(parts);
  for (let i = 0; i < t.part.length; i++) {
    const p = t.part[i] ?? -1;
    if (p < 0) continue;
    n[p] = (n[p] ?? 0) + 1;
    const b = lab(t.base[i * 4] ?? 0, t.base[i * 4 + 1] ?? 0, t.base[i * 4 + 2] ?? 0);
    const f = lab(albedo[i * 4] ?? 0, albedo[i * 4 + 1] ?? 0, albedo[i * 4 + 2] ?? 0);
    for (let c = 0; c < 3; c++) {
      sb[p * 3 + c] = (sb[p * 3 + c] ?? 0) + (b[c] ?? 0);
      sf[p * 3 + c] = (sf[p * 3 + c] ?? 0) + (f[c] ?? 0);
    }
  }
  const mean = (s: Float64Array, p: number): number[] =>
    [0, 1, 2].map((c) => (s[p * 3 + c] ?? 0) / Math.max(1, n[p] ?? 0));
  const base = Array.from({ length: parts }, (_, p) => mean(sb, p));
  const finished = Array.from({ length: parts }, (_, p) => mean(sf, p));
  return {
    base,
    finished,
    drift: base.map((b, p) => ((n[p] ?? 0) > 0 ? deltaE(b, finished[p] ?? b) : 0)),
  };
}

/** Share of the 2-px background ring around the silhouette the image painted (vs its own corners). */
export function ringLeak(v: ControlViews['views'][number], rgba: Uint8Array): number {
  const W = v.width;
  const H = v.height;
  const ref = [0, W - 1, (H - 1) * W, H * W - 1].map((i) =>
    [0, 1, 2].map((c) => rgba[i * 4 + c] ?? 0),
  );
  const bg = [0, 1, 2].map((c) => ref.reduce((s, r) => s + (r[c] ?? 0), 0) / 4);
  let ring = 0;
  let painted = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if ((v.part[i] ?? -1) >= 0) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2 && !near; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && (v.part[yy * W + xx] ?? -1) >= 0)
            near = true;
        }
      if (!near) continue;
      ring++;
      const d = [0, 1, 2].reduce((s, c) => s + Math.abs((rgba[i * 4 + c] ?? 0) - (bg[c] ?? 0)), 0);
      if (d > 60) painted++;
    }
  return ring ? painted / ring : 0;
}

export function checkFinish(
  cv: ControlViews,
  t: Texels,
  albedo: Uint8Array,
  pr: Projection,
  images: readonly Uint8Array[],
  o: FinishQaOptions = {},
): FinishFinding[] {
  const out: FinishFinding[] = [];
  const maxDeltaE = o.maxDeltaE ?? 25;
  const { drift } = paletteDrift(t, albedo, cv.parts.length);
  drift.forEach((d, p) => {
    if (d > maxDeltaE)
      out.push({
        code: 'T3D_FINISH_PALETTE_DRIFT',
        part: cv.parts[p] ?? '',
        message: `mean colour moved ΔE ${d.toFixed(1)} from the declared base (bound ${maxDeltaE})`,
        fix: 'ask for weathering, not a repaint: name the base colours in the prompt / palette, lower the strength, or raise maxDeltaE deliberately',
      });
  });
  const maxLeak = o.maxLeak ?? 0.02;
  pr.leakByPart.forEach((l, p) => {
    if (l > maxLeak)
      out.push({
        code: 'T3D_FINISH_MASK_LEAK',
        part: cv.parts[p] ?? '',
        message: `${(l * 100).toFixed(1)}% of the baked colour came from other parts' pixels (bound ${(maxLeak * 100).toFixed(0)}%)`,
        fix: 'bake with part masking on (the default); never pass mask: false outside diagnostics',
      });
  });
  const maxRing = o.maxRing ?? 0.2;
  cv.views.forEach((v, k) => {
    const r = ringLeak(v, images[k] ?? new Uint8Array());
    if (r > maxRing)
      out.push({
        code: 'T3D_FINISH_MASK_LEAK',
        view: v.name,
        message: `the model painted ${(r * 100).toFixed(0)}% of the 2-px ring outside the silhouette (bound ${(maxRing * 100).toFixed(0)}%): its image does not line up with the control maps`,
        fix: 'condition on depth + normal (ControlNet) at full strength, keep the camera, and ask for a plain flat background',
      });
  });
  return out;
}
