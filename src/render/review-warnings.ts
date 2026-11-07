// Threshold checks over the review metrics: each warning names the metric, the value, the limit
// and the fix. Warnings, not failures — the image metrics are proxies; the vision pass decides.

import type { ExposureStats, MaskStats } from './metrics.ts';

export interface ViewMetrics {
  readonly view: string;
  readonly lod0: MaskStats;
  readonly lod2: MaskStats;
  /** Silhouette IoU LOD0 ↔ LOD2 as seen from afar (64² max-pooled masks, same frame). Low = popping. */
  readonly lodIoU: number;
  /** The same at full mask resolution (256²): lattices and foliage score low here by nature. */
  readonly lodIoUExact: number;
}

export interface ReviewWarning {
  readonly code: string;
  readonly message: string;
  readonly fix: string;
}

export interface ReviewMetrics {
  readonly asset: string;
  readonly triangles: readonly number[];
  readonly hero: ExposureStats;
  readonly views: readonly ViewMetrics[];
  readonly warnings: readonly ReviewWarning[];
}

export const REVIEW_THRESHOLDS = {
  /** LOD0 ↔ LOD2 silhouette IoU below this in any view = visible popping. */
  lodIoU: 0.8,
  heroMeanMin: 0.18,
  heroMeanMax: 0.85,
  heroContrastMin: 0.06,
  nearBlackMax: 0.2,
  nearWhiteMax: 0.1,
  /** Asset spanning less of the hero frame than this: something stretches the bounds. */
  heroSpanMin: 0.5,
} as const;

const f = (v: number): string => v.toFixed(3);

export function warningsOf(m: Omit<ReviewMetrics, 'warnings'>): ReviewWarning[] {
  const t = REVIEW_THRESHOLDS;
  const out: ReviewWarning[] = [];
  for (const v of m.views)
    if (v.lodIoU < t.lodIoU)
      out.push({
        code: 'lod-popping',
        message: `${v.view}: LOD0↔LOD2 silhouette IoU ${f(v.lodIoU)} < ${t.lodIoU}`,
        fix: 'keep the LOD2 massing on the LOD0 silhouette — same outer envelope, fewer cuts (see lods.png)',
      });
  const h = m.hero;
  if (h.span < t.heroSpanMin)
    out.push({
      code: 'tiny-in-frame',
      message: `asset spans ${f(h.span)} of the hero frame (< ${t.heroSpanMin})`,
      fix: 'a stray or far-off part is stretching the bounds — find it in sheet.png and attach or remove it',
    });
  if (h.mean < t.heroMeanMin)
    out.push({
      code: 'too-dark',
      message: `hero mean luminance ${f(h.mean)} < ${t.heroMeanMin}`,
      fix: 'raise vertex colours (dark paint ≈ 0.05–0.1 linear, never 0) or check for inward-facing normals',
    });
  if (h.mean > t.heroMeanMax)
    out.push({
      code: 'washed-out',
      message: `hero mean luminance ${f(h.mean)} > ${t.heroMeanMax}`,
      fix: 'lower vertex colours: real paint and stone rarely exceed ~0.7 linear albedo',
    });
  if (h.contrast < t.heroContrastMin)
    out.push({
      code: 'low-contrast',
      message: `hero luminance contrast ${f(h.contrast)} < ${t.heroContrastMin}`,
      fix: 'add value contrast between materials (trim, rubber, metal, glass) and grime in crevices',
    });
  if (h.nearBlack > t.nearBlackMax)
    out.push({
      code: 'crushed-blacks',
      message: `${f(h.nearBlack)} of asset pixels are near black (> ${t.nearBlackMax})`,
      fix: 'lift near-black colours to ≥ 0.03 linear and check normals point outward',
    });
  if (h.nearWhite > t.nearWhiteMax)
    out.push({
      code: 'blown-whites',
      message: `${f(h.nearWhite)} of asset pixels are near white (> ${t.nearWhiteMax})`,
      fix: 'bring white paint down to ~0.8 linear so texture and shading stay readable',
    });
  return out;
}
