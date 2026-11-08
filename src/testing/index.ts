// Public API of /testing: assertions for users' own recipe tests (`bun test`, vitest, node:test —
// framework-agnostic: each throws a Ts23dError with findings and a fix, or returns quietly).

export {
  assertBudget,
  assertMeasure,
  assertMotionClear,
  assertParts,
  assertQaPass,
  type QaOptions,
} from './assert.ts';
export { ALL_LODS, compileLods, describeFinding, type LodOptions } from './compiled.ts';
export { assertConnected, assertGrown } from './connections.ts';
export {
  assertFlush,
  assertNoGaps,
  assertTouches,
  type FlushAssertOptions,
  type TouchOptions,
} from './gaps.ts';
export { hashBytes } from './hash.ts';
export {
  assertNotEmpty,
  coverage,
  expectImageClose,
  type ImageCloseOptions,
  type NotEmptyOptions,
  type Region,
} from './image.ts';
export { decodeImage, type Image, imageOf } from './image-png.ts';
export {
  assertNoHoles,
  assertSilhouetteMatches,
  enclosedHoles,
  type HoleOptions,
  maskOfImage,
  normaliseMask,
} from './image-silhouette.ts';
export { ALL_AXIS_VIEWS, AXIS_VIEWS, type AxisView, type View } from './image-views.ts';
export { assertLodSilhouette, type LodSilhouetteOptions, lodSilhouetteIoU } from './lod.ts';
export { assertBetween, assertJointsFit, assertSize, type Range } from './measure.ts';
export { assertClosed, assertManifold, assertOutward, type OutwardOptions } from './mesh.ts';
export { type MeshInput, type MeshScope, meshesOf, type NamedMesh } from './mesh-input.ts';
export { assertNoSelfIntersection, selfIntersections } from './mesh-intersect.ts';
export { assertSymmetric, asymmetry, type SymmetryOptions } from './mesh-symmetry.ts';
export { assertMinThickness, type ThicknessOptions, wallThickness } from './mesh-thickness.ts';
export { type Topology, topology } from './mesh-topology.ts';
export { assertPartMotionClear } from './motion.ts';
export { assertPolygonValid, type PolygonOptions, polygonFindings } from './poly.ts';
export {
  artMetrics,
  assertArt,
  focalPoint,
  grounded,
  type ReadabilityOptions,
  restAreas,
  shapeLanguage,
  silhouetteReads,
} from './readability.ts';
export { assertDeterministic, type SnapshotOptions, snapshotHash } from './snapshot.ts';
export {
  assertCentreOfMassInside,
  assertUprightOnGround,
  type GroundOptions,
  type TipOptions,
} from './stability.ts';
export {
  assertNoBleed,
  assertTileable,
  type SheetMaps,
  seamStep,
  type TileOptions,
} from './texture.ts';
export { assertTexelDensity, type TexelOptions, texelDensity } from './texture-density.ts';
export { assertValueRange, type ValueRangeOptions } from './texture-values.ts';
