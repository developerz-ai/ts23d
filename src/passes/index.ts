// Public API of /passes: whole-mesh post-processing applied after geometry — wear, optimisation.

export { type AoOptions, bakeAo, bakeAoAsset } from './bake-ao.ts';
export {
  bakeField,
  type DistanceField,
  type FieldBakeOptions,
  type FieldMap,
  type FieldMaps,
  type FieldProbe,
  fieldProbe,
} from './bake-field.ts';
export {
  bakeHeight,
  fieldHit,
  type HeightBake,
  type HeightBakeOptions,
} from './bake-height.ts';
export { type BakeOptions, bakeNormals, type NormalBake } from './bake-normals.ts';
export { type BakeSource, bakeSourceOf, withBakeSource } from './bake-source.ts';
export { uvTangents } from './bake-tangents.ts';
export { dilateTexels, type TexelFrame, walkTexels } from './bake-texels.ts';
export type { BeltMesh } from './belt-bodies.ts';
export { BeltLoop } from './belt-loop.ts';
export { type BeltRun, beltRun } from './belt-run.ts';
export { type CardWearOptions, cardWear } from './card-wear.ts';
export { type FairOptions, fair } from './fair.ts';
export { type GrimeOptions, type GrimeZone, grime } from './grime.ts';
export {
  type CardZone,
  type HairCardOptions,
  type HairCards,
  hairCards,
} from './hair-cards.ts';
export {
  chainSeed,
  type FlowChain,
  type FlowOptions,
  type FlowSeed,
  flowAt,
  flowDivergence,
  hairFlow,
  tangentOf,
} from './hair-flow.ts';
export { type Imperfect, type ImperfectOptions, imperfect } from './imperfect.ts';
export { type Livery, type LiveryRule, livery } from './livery.ts';
export {
  type FieldMorphOptions,
  fieldMorph,
  type HingeMorphOptions,
  hingeMorph,
  type MorphField,
  sumMorphs,
} from './morph.ts';
export { type OptimizeOptions, type OptimizeReport, optimize } from './optimize.ts';
export { RayGrid } from './ray-grid.ts';
export { type Simplified, type SimplifyOptions, simplify } from './simplify.ts';
export {
  bindPoseError,
  inverseBind,
  jointLocals,
  type Mat4,
  poseJoints,
  skinPositions,
  weightBonesOf,
} from './skin-bind.ts';
export { type HeatOptions, heatWeights } from './skin-heat.ts';
export {
  bindRigid,
  capsuleDistance,
  pieceIds,
  type SkinWeightOptions,
  skinPieces,
  skinWeights,
  WEIGHT_STEP,
  type WeightBone,
} from './skin-weights.ts';
export { type Weathered, weather } from './weather.ts';
export { SELECTORS as WEATHER_SELECTORS } from './weather-select.ts';
export { subdivideTo } from './weather-subdivide.ts';
export type {
  Climate,
  CoverEffect,
  DentEffect,
  RustEffect,
  SpanEffect,
  Spot,
  WeatherEffects,
  WeatheringOptions,
} from './weather-types.ts';
export { type WeightedNormalsOptions, weightedNormals } from './weighted-normals.ts';
