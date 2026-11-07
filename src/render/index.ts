// Public API of /render: zero-GPU images an agent (and a README) can use — contact sheets,
// thumbnails, beauty product shots, LOD strips, and the AI review pack with image metrics.

export {
  type BeautyOptions,
  type BeautyRender,
  beauty,
  cameraFor,
  renderBeauty,
} from './beauty.ts';
export type { PerspectiveCamera } from './camera.ts';
export { type LodStripOptions, lodStrip } from './lod-strip.ts';
export {
  type ExposureStats,
  exposure,
  type MaskStats,
  maskIoU,
  maskStats,
  poolMask,
  type Silhouette,
  silhouette,
  viewFrame,
} from './metrics.ts';
export { checkBeautyOptions, parseSize } from './options.ts';
export { type PhotoCamera, type PhotoMatchOptions, photoMatch } from './photo-match.ts';
export { detailWindows, type ReviewOptions, type ReviewPack, reviewPack } from './review.ts';
export {
  REVIEW_THRESHOLDS,
  type ReviewMetrics,
  type ReviewWarning,
  type ViewMetrics,
} from './review-warnings.ts';
export { contactSheet, type SheetOptions, VIEWS } from './sheet.ts';
export { type ThumbnailOptions, thumbnail } from './thumbnail.ts';
