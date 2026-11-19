// Public API of /export: back ends that turn a CompiledAsset into a file.

export { AUDIO_EMITTER } from './audio.ts';
export { type SoundFile, type SoundUse, soundFiles, soundUses } from './audio-files.ts';
export { animationsOf, type ClipTree, clipSummary, Z_UP_TO_Y_UP } from './clips.ts';
export {
  type DrawFinding,
  drawCallsOf,
  drawFindings,
  type GlbContents,
  glbContents,
} from './draw-budget.ts';
export {
  FINISH_MATERIAL,
  type FinishLayer,
  HERO_MATERIAL,
  readGlbChunks,
  withFinishLayer,
} from './finish-glb.ts';
export {
  type ExportWarning,
  exportGlb,
  exportLodGlb,
  type GlbOptions,
  type GlbResult,
  type LodGlbResult,
  toGlb,
  toLodGlb,
} from './glb.ts';
export {
  GPU_INSTANCING,
  type InstancedScene,
  type InstanceSet,
  type InstanceTransform,
  type SceneManifest,
  sceneManifest,
  toInstancedGlb,
} from './instancing.ts';
export {
  checkCoverage,
  coverageFor,
  defaultCoverage,
  type LodCoverage,
  MSFT_LOD,
  SCREEN_COVERAGE,
} from './lod-coverage.ts';
export { mergeToPivots } from './merge-pivots.ts';
export { morphMeshFields, morphTargets } from './morph-targets.ts';
export {
  type ExportReport,
  optimizeParts,
  type PartOptimizeReport,
  summarize,
} from './optimize-parts.ts';
export { type OwnTextureSet, withOwnTextures } from './own-textures.ts';
export {
  ANISOTROPY,
  CLEARCOAT,
  finishExtensions,
  IOR,
  IRIDESCENCE,
  materialExtensions,
  opticsMaterial,
  SHEEN,
  SPECULAR,
  TRANSMISSION,
  VOLUME,
  withFinish,
} from './pbr.ts';
export {
  type ColliderReport,
  IMPLICIT_SHAPES,
  type PhysicsOptions,
  type PhysicsReport,
  RIGID_BODIES,
} from './physics.ts';
export type { EngineConvention } from './physics-engines.ts';
export { fitHitboxes, HITBOX_COVERAGE, type Hitbox } from './physics-hitbox.ts';
export {
  ENGINES,
  type Engine,
  type EngineLayout,
  type ExportProfile,
  engineLayout,
  PROFILES,
  type ProfileSettings,
  profileSettings,
  sheetInProject,
} from './profile.ts';
export { bindLoose, skeletonOf, skinAttributes, writeSkin, Y_UP_TO_Z_UP } from './skin.ts';
export { mikkTangents, tangentsOf } from './tangents.ts';
export { type TextureJson, type TextureSetPlan, textureSetPlan } from './texture-sets.ts';
export { hasUvLayout, textureSetWarnings, uvsOutside } from './texture-uvs.ts';
export {
  type ExternalSheet,
  SHEET_MAPS,
  type SheetBinding,
  type SheetMap,
  sheetFileName,
  sheetPngs,
} from './textures.ts';
