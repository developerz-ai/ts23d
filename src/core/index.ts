// Public API of @ts23d/core: errors, RNG, vector math, the mesh IR and the asset DSL root.

export {
  type Asset,
  type AssetDefinition,
  BUDGETS,
  type Budget,
  type BuildContext,
  type Check,
  type CheckFinding,
  type CompiledAsset,
  compile,
  defineAsset,
  type Emitter,
  type EmitterOptions,
  isAsset,
  type Lod,
  type Measure,
  type Motion,
  type Part,
  type PartOptions,
  type RealDimensions,
  type Slide,
  type Socket,
  type SocketOptions,
  type Spin,
  type Surface,
  type Sway,
  type UseOptions,
} from './asset.ts';
export { type ErrorCode, type ErrorDetails, notImplemented, Ts23dError } from './errors.ts';
export { defineFamily, type Family, type FamilyDefinition, type Variant } from './family.ts';
export {
  type Bounds,
  boundsOf,
  type Mesh,
  MeshBuilder,
  merge,
  translate,
  triangleCount,
  type Vertex,
} from './mesh.ts';
export { encodePng } from './png.ts';
export { createRng, type Rng } from './rng.ts';
export { type Affine, affine, applyAffine, frame, type Placement, place } from './transform.ts';
export {
  add,
  cross,
  dot,
  length,
  normalize,
  type Quat,
  quatFromAxisAngle,
  scale,
  sub,
  type Vec2,
  type Vec3,
} from './vec.ts';
export {
  rotateZ,
  toWorld,
  type WorldTransform,
  worldMesh,
  worldMeshes,
  worldTransforms,
} from './world.ts';
