// Public API of /passes: whole-mesh post-processing applied after geometry — wear, optimisation.

export { type AoOptions, bakeAo, bakeAoAsset } from './bake-ao.ts';
export { type BakeOptions, bakeNormals, type NormalBake } from './bake-normals.ts';
export { uvTangents } from './bake-tangents.ts';
export { type GrimeOptions, type GrimeZone, grime } from './grime.ts';
export { type Imperfect, type ImperfectOptions, imperfect } from './imperfect.ts';
export { type Livery, type LiveryRule, livery } from './livery.ts';
export { type OptimizeOptions, type OptimizeReport, optimize } from './optimize.ts';
export { RayGrid } from './ray-grid.ts';
export { type Simplified, type SimplifyOptions, simplify } from './simplify.ts';
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
