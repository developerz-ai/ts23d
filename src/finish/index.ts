// Public API of /finish: the optional AI finish layer. Code builds the asset; an image model (or
// the procedural mock) adds surface detail from deterministic control maps; the result is baked
// back onto a per-asset atlas as an extra LOD0 material — geometry, parts, pivots, motion, LODs,
// physics and sounds stay the code's. Model results are cached by hash; the gate never runs one.

export { type Atlas, type AtlasPart, buildAtlas, isFinishable } from './atlas.ts';
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
export { type HttpFinishOptions, httpFinish, requestBody } from './http.ts';
export { effectsOf, MOCK_MODEL_ID, mockFinish, noise3 } from './mock.ts';
export { finishCompare, type PreviewOptions, previewImage } from './preview.ts';
export { checkFinish, type FinishQaOptions, paletteDrift, ringLeak } from './qa.ts';
export { type FinishScene, finishScene } from './scene.ts';
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
