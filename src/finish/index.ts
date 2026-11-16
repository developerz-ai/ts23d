// Public API of /finish: the optional AI finish layer. Code builds the asset; an image model (or
// the procedural mock) adds surface detail from deterministic control maps; the result is baked
// back onto a per-asset atlas as an extra LOD0 material — geometry, parts, pivots, motion, LODs,
// physics and sounds stay the code's. Model results are cached by hash; the gate never runs one.

export { type Atlas, type AtlasPart, buildAtlas, isFinishable, type Unwrap } from './atlas.ts';
export { type BakeOptions, decodeViews, type Projection, project } from './bake.ts';
export { cacheKey, fileStore, memoryStore, runCached } from './cache.ts';
export { type ControlOptions, controlViews, viewAngles } from './control.ts';
export { type ControlMaps, exportControlMaps, partColours } from './control-maps.ts';
export {
  assertFinish,
  FINISH_NOTE,
  type FinishMaps,
  type FinishOptions,
  type FinishResult,
  finishAsset,
} from './finish.ts';
export { type FinishPngs, finishedGlb, finishPngs } from './glb.ts';
export {
  type HeroMaps,
  type HeroOptions,
  type HeroPngs,
  type HeroResult,
  heroGlb,
  heroPngs,
  heroTier,
} from './hero.ts';
export {
  checkHero,
  densityRatio,
  HERO_DENSITY_TOL,
  HERO_MISS_MAX,
  type HeroFinding,
  type HeroPartStat,
  type HeroQaInput,
} from './hero-qa.ts';
export { type HttpFinishOptions, httpFinish, neuralFinish, requestBody } from './http.ts';
export { type LscmOptions, lscmCharts, STRETCH_MAX, type UvChart } from './lscm.ts';
export {
  type DerivedMaps,
  type DeriveOptions,
  deriveMaps,
  graphHeight,
  type HeightAt,
} from './maps.ts';
export { effectsOf, MOCK_MODEL_ID, mockFinish, noise3 } from './mock.ts';
export {
  closestColour,
  delight,
  highPassOver,
  projectViews,
  transferColours,
  turnaroundCameras,
  type View as ProjectionView,
} from './neural-texture.ts';
export { finishCompare, type PreviewOptions, previewImage } from './preview.ts';
export { checkFinish, type FinishQaOptions, paletteDrift, ringLeak } from './qa.ts';
export { type FinishScene, finishScene } from './scene.ts';
export {
  type ConceptImage,
  cropPart,
  fitIntoBox,
  type PartCrop,
  type SplitPartsOptions,
  splitParts,
} from './split-parts.ts';
export { atlasTexels, type Texels } from './texels.ts';
export type {
  ControlView,
  ControlViews,
  FinishFinding,
  FinishModel,
  FinishProvenance,
  FinishRequest,
  FinishStore,
} from './types.ts';
