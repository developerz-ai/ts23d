// Public API of /qa: the gate every compiled asset passes before it ships.

export { clear, noOverlap, runChecks, symmetric, touches } from './checks.ts';
export { clashes } from './clash.ts';
export {
  type ConnectionReport,
  connectionFindings,
  connectionReport,
  connections,
} from './connections.ts';
export {
  type ConnectCode,
  type ConnectIssue,
  type ConnectOk,
  connectionOf,
  type Declared,
} from './connections-declare.ts';
export { connectionsOverlay, OVERLAY_VIEWS, type OverlayOptions } from './connections-overlay.ts';
export {
  BOUND_RENDERS,
  CRITERIA,
  CRITIQUE_MINIMUM,
  type Criterion,
  type CriterionScore,
  type Critique,
  critiqueFindings,
  parseCritique,
} from './critique.ts';
export {
  detailHeatmap,
  type RgbaImage,
  silhouetteStrip,
  valueMap,
} from './critique-art-images.ts';
export {
  ART_RENDER,
  ART_THRESHOLDS,
  type ArtFinding,
  type ArtInput,
  type ArtIntent,
  type ArtMaps,
  type ArtMetrics,
  artFindings,
  GROUNDED_KINDS,
  measureArt,
} from './critique-metrics.ts';
export {
  critiqueTemplate,
  RUBRIC,
  type RubricInput,
  referenceLinks,
  refsMarkdown,
  rubricMarkdown,
} from './critique-rubric.ts';
export { SHAPE_THRESHOLDS, type ShapeClass } from './critique-shape.ts';
export {
  type DepthView,
  depthView,
  depthViews,
  pixelToWorld,
  VIEW_NAMES,
  viewName,
} from './depth-views.ts';
export { floatingParts, touching } from './floating.ts';
export { type Flushness, type FlushOptions, flushness } from './flush.ts';
export { gapOverlay, gapZoom } from './gap-overlay.ts';
export {
  describeGap,
  type Gap,
  type GapOptions,
  type GapScan,
  gapFinding,
  gaps,
  scanGaps,
  worstPerPair,
} from './gaps.ts';
export {
  DEFAULT_GATES,
  partNames,
  proportions,
  runQa,
  silhouetteIoU,
  triangleBudget,
} from './gates.ts';
export { pointTriangleDistance, surfaceSamples, TriangleGrid } from './geometry.ts';
export { insideSolid } from './inside.ts';
export { glob, type Inspector, inspect, type Penetration } from './inspect.ts';
export { joints } from './joints.ts';
export {
  DEFAULT_LOD_GATES,
  type LodGate,
  lodPivots,
  lodSilhouette,
  lodTriangles,
  runLodQa,
} from './lods.ts';
export { type Ruler, ruler, type Size } from './measure.ts';
export { measure, measures } from './measures.ts';
export { hiddenParts, zFighting } from './occlusion.ts';
export { degenerateTriangles, nonFinite, normalsMatchWinding, vertexColors } from './sanity.ts';
export { findSlits, type Slit, type SlitOptions } from './slits.ts';
export { treads } from './treads.ts';
export { CLASH_EPS, CONTACT_EPS, type Finding, type Gate } from './types.ts';
export { weatherGate } from './weather.ts';
