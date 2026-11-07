// Public API of /passes: whole-mesh post-processing applied after geometry — wear, optimisation.

export { type AoOptions, bakeAo, bakeAoAsset } from './bake-ao.ts';
export { type GrimeOptions, type GrimeZone, grime } from './grime.ts';
export { type Livery, type LiveryRule, livery } from './livery.ts';
export { type OptimizeOptions, type OptimizeReport, optimize } from './optimize.ts';
export { RayGrid } from './ray-grid.ts';
export { type WeightedNormalsOptions, weightedNormals } from './weighted-normals.ts';
