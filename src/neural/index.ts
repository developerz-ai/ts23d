// Public API of /neural: optional adapters for what recipes do poorly — licensed GLB import (scans,
// CC0 base meshes) with cleanup, a local-model refine adapter, planned local generators, and image
// sources (kubeez.com) for references and materials. Never required by a recipe.

export { type GenerateRequest, localGenerator, type MeshGenerator } from './generator.ts';
export {
  type AccessorData,
  type GlbDoc,
  type GltfJson,
  readAccessor,
  readGlb,
  readImage,
} from './glb-read.ts';
export { type ScenePrimitive, scenePrimitives } from './glb-scene.ts';
export { type FixtureNode, GlbBin, packGlb, writeMeshGlb } from './glb-write.ts';
export { type ImageRequest, type ImageSource, kubeezImages } from './images.ts';
export { onSheet, projectAlbedo, sampleRgba, toLinear } from './import-albedo.ts';
export { importBytes, provideImports } from './import-cache.ts';
export {
  type CleanOptions,
  type CleanReport,
  cleanMesh,
  type ShellReport,
  smoothNormals,
} from './import-clean.ts';
export {
  type ImportedMesh,
  type ImportOptions,
  type ImportSource,
  importGlb,
} from './import-glb.ts';
export { checkLicence, type ImportCredit, type LicenceVerdict } from './import-licence.ts';
export {
  type RefineCache,
  type Refined,
  type RefineHttpInit,
  type RefineHttpReply,
  type RefineOptions,
  type RefineRequest,
  refine,
} from './refine.ts';
export { sha256Hex } from './sha256.ts';
