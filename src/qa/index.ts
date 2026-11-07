// Public API of /qa: the gate every compiled asset passes before it ships.

export { clear, noOverlap, runChecks, symmetric, touches } from './checks.ts';
export { clashes } from './clash.ts';
export { floatingParts, touching } from './floating.ts';
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
export {
  DEFAULT_LOD_GATES,
  type LodGate,
  lodPivots,
  lodSilhouette,
  lodTriangles,
  runLodQa,
} from './lods.ts';
export { measure, measures } from './measures.ts';
export { hiddenParts, zFighting } from './occlusion.ts';
export { degenerateTriangles, nonFinite, normalsMatchWinding, vertexColors } from './sanity.ts';
export { CLASH_EPS, CONTACT_EPS, type Finding, type Gate } from './types.ts';
