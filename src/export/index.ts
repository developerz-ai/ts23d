// Public API of /export: back ends that turn a CompiledAsset into a file.

export { AUDIO_EMITTER } from './audio.ts';
export { type SoundFile, type SoundUse, soundFiles, soundUses } from './audio-files.ts';
export { FINISH_MATERIAL, type FinishLayer, readGlbChunks, withFinishLayer } from './finish-glb.ts';
export {
  exportGlb,
  exportLodGlb,
  type GlbOptions,
  type GlbResult,
  type LodGlbResult,
  toGlb,
  toLodGlb,
} from './glb.ts';
export {
  checkCoverage,
  coverageFor,
  defaultCoverage,
  type LodCoverage,
  MSFT_LOD,
  SCREEN_COVERAGE,
} from './lod-coverage.ts';
export { mergeToPivots } from './merge-pivots.ts';
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
export {
  type ExportProfile,
  PROFILES,
  type ProfileSettings,
  profileSettings,
} from './profile.ts';
export {
  type ExternalSheet,
  SHEET_MAPS,
  type SheetBinding,
  type SheetMap,
  sheetFileName,
  sheetPngs,
} from './textures.ts';
