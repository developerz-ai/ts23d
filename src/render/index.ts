// Public API of /render: zero-GPU images an agent (and a README) can use — contact sheets,
// thumbnails, beauty product shots, measured blueprints, LOD strips, and the AI review pack with
// image metrics.

export {
  type BeautyOptions,
  type BeautyRender,
  beauty,
  cameraFor,
  renderBeauty,
} from './beauty.ts';
export { BLUEPRINT_VIEWS, type BlueprintOptions, blueprint } from './blueprint.ts';
export { type MeasureResult, measureResults } from './blueprint-measures.ts';
export type { PerspectiveCamera } from './camera.ts';
export {
  type CameraSolve,
  type Mark,
  type PhotoCamera,
  perspectiveOf,
  solveCamera,
} from './camera-solve.ts';
export { drawText, textWidth } from './font.ts';
export {
  ICON_CAMERA,
  type IconImage,
  type IconOptions,
  icon,
  type PortraitOptions,
  portrait,
  renderIcon,
  renderPortrait,
} from './icon.ts';
export {
  RTS_CAMERA,
  type RtsViewOptions,
  rtsView,
  type TeamCoverage,
  teamCoverage,
} from './icon-rts.ts';
export {
  checkInputImage,
  type InputImageFinding,
  type InputImageReport,
} from './input-image.ts';
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
export { type PartMasks, partBox, partMasks } from './part-masks.ts';
export {
  HERO_PATH,
  type PathOptions,
  type PathRender,
  pathHero,
  pathHeroThreaded,
  renderPath,
  renderPathThreaded,
} from './path/path-hero.ts';
export { type PhotoMatch, type PhotoMatchOptions, photoMatch, photoView } from './photo-match.ts';
export { type Photo, resizePhoto, type SegmentOptions, segmentPhoto } from './photo-segment.ts';
export { type PoseFrame, poseStrip } from './pose-strip.ts';
export { type Camera as RasterCamera, orthoCamera, type View as RasterView } from './raster.ts';
export { detailWindows, type ReviewOptions, type ReviewPack, reviewPack } from './review.ts';
export {
  REVIEW_THRESHOLDS,
  type ReviewMetrics,
  type ReviewWarning,
  type ViewMetrics,
} from './review-warnings.ts';
export { contactSheet, type SheetOptions, VIEWS } from './sheet.ts';
export {
  type SilhouetteScore,
  type SilhouetteSheet,
  type SilhouetteVariant,
  silhouetteSheet,
} from './silhouette-sheet.ts';
export { type ThumbnailOptions, thumbnail } from './thumbnail.ts';
