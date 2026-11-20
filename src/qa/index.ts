// Public API of /qa: the gate every compiled asset passes before it ships.

export { type BoneChain, bodyPath, leafChains, longChains } from './chain-bones.ts';
export { CROSS_FPS, chainCross, chainCrossFindings, PENETRATION_SHARE } from './chain-cross.ts';
export { AREA_KEPT, chainTwistFindings, TWIST_LIMIT, twistDegrees } from './chain-twist.ts';
export {
  type BodyChain,
  bodyChain,
  type ClipWave,
  measureWave,
  SWIM_FPS,
  type WaveHeading,
} from './chain-wave.ts';
export { checkSelectors } from './check-selectors.ts';
export { clear, noOverlap, runChecks, selectorsOf, symmetric, touches } from './checks.ts';
export { clashes } from './clash.ts';
export {
  coherence,
  coherenceFindings,
  MIN_PALETTE_SHARE,
  MIN_SET_FOR_Z,
  robustZ,
  type StyleMetrics,
  styleMetrics,
  TEXEL_TOLERANCE,
} from './coherence.ts';
export { ciede2000, type Lab, labOfLinear } from './coherence-colour.ts';
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
  type CalibratedScore,
  type CalibrationModel,
  calibratedScore,
  fitCalibration,
  GOLDEN,
  type GoldenRow,
  type GoldenSet,
  INFLATION_TOLERANCE,
  isotonic,
  leaveOneGroupOut,
  PANEL_CRITERIA,
  PANEL_INFLATION_TOLERANCE,
  predict,
  type Sample,
  spearman,
} from './critique-calibrate.ts';
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
export { REF_METRICS, type RefGaps, refGaps } from './critique-ref.ts';
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
  imageStats,
  METRICS,
  type Metric,
  type MetricVector,
  meshStats,
  metricVector,
  VECTOR_RENDER,
  type VectorImage,
} from './critique-vector.ts';
export { WEAR_PATCHES, type WearMetrics, wearMetrics, wearOf } from './critique-wear.ts';
export { deform, deformFindings, romPoses } from './deform.ts';
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
export {
  cardRootProof,
  cardRoots,
  type FurSilhouetteZone,
  furSilhouette,
  furSilhouetteCheck,
} from './fur-silhouette.ts';
export { gait, gaitFindings } from './gait.ts';
export { SKIN_SINK_LIMIT, soleSinks } from './gait-skin.ts';
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
  emptyAsset,
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
export { albedoSpread, GROUND, GROUND_SHARE, model, TEXTURE_STD } from './model.ts';
export { doubledFeatures, GIRTH, GIRTH_UPRIGHT, outlines, UPRIGHT } from './model-doubled.ts';
export { FIT_SPAN, FIT_TURN, hugTurn, skeletonHug, skeletonSpan } from './model-hug.ts';
export { hiddenParts, zFighting } from './occlusion.ts';
export { poseFrames } from './pose-frames.ts';
export {
  compareFingerprints,
  type Fingerprint,
  type FingerprintDistance,
  FP_SIZE,
  fingerprint,
  srgbToLab,
} from './ref-fingerprint.ts';
export {
  checkRefFile,
  encodeRefMask,
  maskOfRefPng,
  modelOutline,
  REF_LIMITS,
  REF_VIEWS,
  type RefCamera,
  type RefFile,
  type RefLimits,
  type RefSource,
  type RefView,
  type RefViewName,
  refFindings,
  refFingerprint,
  refSilhouette,
} from './ref-gate.ts';
export {
  degenerateTriangles,
  meshArrays,
  nonFinite,
  normalsMatchWinding,
  vertexColors,
} from './sanity.ts';
export {
  type CameraLoad,
  cameraLoad,
  LOD_SWITCH,
  referenceCameras,
  type SceneAssetStats,
  type SceneBudget,
  type SceneCamera,
  type ScenePlacement,
  sceneBudgetFindings,
} from './scene-budget.ts';
export { BIND_TOLERANCE, SUM_TOLERANCE, skin, skinFindings } from './skin.ts';
export { findSlits, type Slit, type SlitOptions } from './slits.ts';
export {
  BURST_TOLERANCE,
  HEAD_TO_TAIL,
  PEAK_AT,
  RECOIL_LIMIT,
  SLIP,
  STRIDE,
  STROUHAL,
  swim,
  swimFindings,
  TAIL_EXCURSION,
} from './swim.ts';
export { treads } from './treads.ts';
export { CLASH_EPS, CONTACT_EPS, codeOf, type Finding, type Gate, qaCode } from './types.ts';
export { weatherGate } from './weather.ts';
