// AI review pack: everything a vision-capable agent needs to judge an asset in one folder — hero,
// contact sheet, two detail close-ups (where the triangles are), the LOD strip, review.md (the
// checklist prompt) and review.json (model-free image metrics with threshold warnings).

import { type Asset, compile, encodePng, type Lod } from '../core/index.ts';
import { type PaintedSheet, type SheetRecipe, sheetFor } from '../material/index.ts';
import { type BeautyOptions, renderBeauty } from './beauty.ts';
import { exportedTriangles, lodStrip } from './lod-strip.ts';
import { exposure, maskIoU, maskStats, poolMask, silhouette, viewFrame } from './metrics.ts';
import { reviewPrompt } from './review-prompt.ts';
import { type ReviewMetrics, warningsOf } from './review-warnings.ts';
import { contactSheet, VIEWS } from './sheet.ts';
import { previewSheet } from './sheet-tones.ts';

export interface ReviewOptions {
  readonly sheet?: PaintedSheet;
  /** Paint the asset's own sheet from this recipe (its size); `sheet` wins when both are set. */
  readonly sheetRecipe?: SheetRecipe;
  readonly width?: number;
  readonly height?: number;
  readonly azDeg?: number;
  readonly elDeg?: number;
  readonly fovDeg?: number;
  /** Path of the reference dossier (recipes/<name>/README.md) the prompt points the reviewer at. */
  readonly refs?: string;
}

export interface ReviewPack {
  /** File name (inside the review folder) → contents. */
  readonly files: ReadonlyMap<string, Uint8Array | string>;
  readonly metrics: ReviewMetrics;
}

/** Two zoom windows centred on the densest cells of the hero's 16 × 9 detail grid, ≥ 4 cells apart. */
export function detailWindows(detail: Uint32Array): { x: number; y: number }[] {
  const order = [...detail.keys()].sort((a, b) => (detail[b] ?? 0) - (detail[a] ?? 0) || a - b);
  const picked: number[] = [];
  for (const c of order) {
    if ((detail[c] ?? 0) === 0 || picked.length === 2) break;
    if (
      picked.every(
        (p) => Math.hypot((p % 16) - (c % 16), Math.floor(p / 16) - Math.floor(c / 16)) >= 4,
      )
    )
      picked.push(c);
  }
  const clamp = (v: number): number => Math.min(5 / 6, Math.max(1 / 6, v));
  return picked.map((c) => ({
    x: clamp(((c % 16) + 0.5) / 16),
    y: clamp((Math.floor(c / 16) + 0.5) / 9),
  }));
}

export function reviewPack(asset: Asset, o: ReviewOptions = {}): ReviewPack {
  const lods = ([0, 1, 2] as Lod[]).map((lod) => compile(asset, { lod }));
  const lod0 = lods[0] ?? compile(asset);
  const lod2 = lods[2] ?? lod0;
  const sheet = o.sheet ?? (o.sheetRecipe ? sheetFor(lods, o.sheetRecipe) : undefined);
  const base: BeautyOptions = {
    ...(sheet ? { sheet } : {}),
    ...(o.width ? { width: o.width } : {}),
    ...(o.height ? { height: o.height } : {}),
    ...(o.azDeg !== undefined ? { azDeg: o.azDeg } : {}),
    ...(o.elDeg !== undefined ? { elDeg: o.elDeg } : {}),
    ...(o.fovDeg !== undefined ? { fovDeg: o.fovDeg } : {}),
  };
  const files = new Map<string, Uint8Array | string>();
  const hero = renderBeauty(lod0, base);
  files.set('hero.png', encodePng(hero.width, hero.height, hero.rgba));
  // The same preview sheet as `t3d shot`, whatever size the hero's sheet is: the same bytes.
  files.set('sheet.png', contactSheet(lod0, { far: lod2, sheet: previewSheet([lod0, lod2]) }));
  detailWindows(hero.detail).forEach((w, i) => {
    const r = renderBeauty(lod0, { ...base, window: { ...w, zoom: 3 } });
    files.set(`detail_${i + 1}.png`, encodePng(r.width, r.height, r.rgba));
  });
  // Each LOD panel at most 640 × 480 (smaller when the pack itself is rendered small).
  const k = Math.min(1, (o.width ?? 1600) / 640);
  const panel = {
    width: Math.max(16, Math.round(640 * k)),
    height: Math.max(16, Math.round(480 * k)),
  };
  files.set('lods.png', lodStrip(lods, { ...base, ...panel }));
  const views = VIEWS.slice(0, 5).map((view) => {
    const frame = viewFrame(lod0, view);
    const a = silhouette(lod0, view, 256, frame);
    const b = silhouette(lod2, view, 256, frame);
    return {
      view: view.label,
      lod0: maskStats(a),
      lod2: maskStats(b),
      lodIoU: maskIoU(poolMask(a, 4).mask, poolMask(b, 4).mask),
      lodIoUExact: maskIoU(a.mask, b.mask),
    };
  });
  const partial = {
    asset: asset.name,
    // What the GLBs hold (as the manifest reports), not the compiled count.
    triangles: lods.map(exportedTriangles),
    hero: exposure(hero.rgba, hero.mask, hero.width),
    views,
  };
  const metrics: ReviewMetrics = { ...partial, warnings: warningsOf(partial) };
  files.set('review.json', `${JSON.stringify(metrics, null, 2)}\n`);
  files.set('review.md', reviewPrompt(metrics, [...files.keys()], o.refs));
  return { files, metrics };
}
