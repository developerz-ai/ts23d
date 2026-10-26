// Public API of @ts23d/core: errors, RNG, vector math, the mesh IR and the asset DSL root.

export {
  type Asset,
  type AssetDefinition,
  type Budget,
  type BuildContext,
  type CompiledAsset,
  compile,
  defineAsset,
  isAsset,
  type Lod,
  type Motion,
  type Part,
  type PartOptions,
  type Slide,
  type Spin,
  type UseOptions,
} from './asset.ts';
export { type ErrorCode, type ErrorDetails, notImplemented, Ts23dError } from './errors.ts';
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
export { createRng, type Rng } from './rng.ts';
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
export { rotateZ, toWorld, type WorldTransform, worldTransforms } from './world.ts';
