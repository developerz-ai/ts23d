// Public API of /neural: optional adapters for what recipes do poorly — any model through a
// NeuralAdapter (t3d-neural/1 http, ComfyUI, OpenAI-compatible images, mock), the committed
// per-recipe output cache, licensed GLB import (scans, CC0 base meshes) with cleanup, a local-model
// refine adapter, kubeez.com (partner) for image generation without a GPU, and tool adapters
// (Blender cloth / Rigify / fracture, Godot engine-check, basisu KTX2, gltfpack meshopt). Never
// required by a recipe (ADR 014/015).

export {
  canonicalJson,
  defineConfig,
  fieldsOf,
  inputsOf,
  jobKey,
  NEURAL_CONTRACT,
  type NeuralAdapter,
  type NeuralBinding,
  type NeuralJob,
  type NeuralModelInfo,
  type NeuralRun,
  type NeuralToolInfo,
  pickModel,
  requestKey,
  runJob,
  type T3dConfig,
  taskResult,
} from './adapter.ts';
export {
  BLENDER_LICENCE,
  BLENDER_LINES,
  BLENDER_LTS,
  BLENDER_STEP_FILES,
  BLENDER_TASKS,
  type BlenderAdapterOptions,
  blenderAdapter,
  blenderJobArgs,
  defaultScripts,
} from './blender-adapter.ts';
export {
  findLavapipe,
  LAVAPIPE_MANIFESTS,
  looksCrashed,
  REVIEW_CRASH_FIX,
  SOFTWARE_GPU_ARGS,
  softwareGpuEnv,
  softwareGpuExec,
} from './blender-gpu.ts';
export { BLENDER_SCRIPTS_FIX, blenderScriptsDir } from './blender-scripts.ts';
export {
  type BlenderBatch,
  type BlenderSessionOptions,
  type BlenderSessionStart,
  blenderSessionStatus,
  finishBlenderSession,
  runBlenderBatch,
  SESSION_REPLAY_NOTE,
  startBlenderSession,
  stopBlenderSession,
  undoBlenderBatch,
} from './blender-session.ts';
export { BLENDER_SKELETON_CONTRACT, skeletonJson } from './blender-skeleton.ts';
export {
  BLENDER_BRUSHES,
  type BlenderBrush,
  type BlenderStrokeStamp,
  type BlenderStrokeStep,
} from './blender-step-stroke.ts';
export {
  BLENDER_REPORT_CONTRACT,
  BLENDER_STEPS_CONTRACT,
  type BlenderBakeMap,
  type BlenderFocus,
  type BlenderMask,
  type BlenderOp,
  type BlenderPose,
  type BlenderReviewView,
  type BlenderStep,
  type BlenderWeightMask,
  blenderProgram,
  checkBlenderSteps,
  jsonInput,
} from './blender-steps.ts';
export { type ComfyAdapterOptions, comfyAdapter, fillWorkflow } from './comfy-adapter.ts';
export { type GenerateRequest, localGenerator, type MeshGenerator } from './generator.ts';
export {
  type AccessorData,
  type GlbDoc,
  type GltfJson,
  readAccessor,
  readGlb,
  readImage,
  textureSource,
} from './glb-read.ts';
export {
  type M4,
  type SceneGraph,
  type ScenePrimitive,
  sceneGraph,
  scenePrimitives,
} from './glb-scene.ts';
export { type FixtureNode, GlbBin, packGlb, writeMeshGlb } from './glb-write.ts';
export {
  CHECK_GD,
  GODOT_PROJECT,
  type GodotAdapterOptions,
  godotAdapter,
  importerLines,
} from './godot-adapter.ts';
export { type HttpAdapterOptions, http, httpAdapter } from './http-adapter.ts';
export { onSheet, projectAlbedo, sampleRgba, toLinear } from './import-albedo.ts';
export { importBytes, provideImports } from './import-cache.ts';
export {
  type CleanOptions,
  type CleanReport,
  cleanMesh,
  type ShellReport,
  smoothNormals,
} from './import-clean.ts';
export { closeCycle } from './import-clips-loop.ts';
export {
  type ImportedMesh,
  type ImportOptions,
  type ImportSource,
  importGlb,
} from './import-glb.ts';
export { checkLicence, type ImportCredit, type LicenceVerdict } from './import-licence.ts';
export {
  type ImportedModel,
  type ImportModelOptions,
  type InlineModel,
  importModel,
} from './import-model.ts';
export type { TextureOptions } from './import-textures.ts';
export { aspectOf, KUBEEZ_TERMS, type KubeezOptions, kubeezAdapter } from './kubeez-adapter.ts';
export {
  MESHY_RIG_MODEL,
  MESHY_TERMS,
  type MeshyAdapter,
  meshyAdapter,
} from './meshy-adapter.ts';
export { type MeshyBalance, meshyBalance, meshyEstimate } from './meshy-credits.ts';
export { filePending, memoryPending } from './meshy-net.ts';
export {
  MESHY_LIMITS,
  MESHY_MODELS,
  type MeshyOptions,
  type MeshyPending,
  meshyCost,
} from './meshy-params.ts';
export { MESHY_TEXTURE_MODELS } from './meshy-post.ts';
export {
  MESHY_SKELETONS,
  type MeshyAnimation,
  meshyAnimations,
  resolveClips,
} from './meshy-rig.ts';
export { meshyTasks } from './meshy-task.ts';
export { MOCK_LICENCE, type MockAdapter, mockAdapter } from './mock-adapter.ts';
export {
  type OpenAiImageOptions,
  openaiImage,
  openaiImageAdapter,
} from './openai-image-adapter.ts';
export {
  entryOf,
  NEURAL_CAP_BYTES,
  type NeuralEntry,
  type NeuralLookup,
  type NeuralNotice,
  neuralCache,
  providedNeural,
  provideNeural,
  type RecipeNeuralCache,
} from './recipe-cache.ts';
export {
  makeRecord,
  type NeuralRecord,
  type NeuralRecordOutput,
  outputFile,
  parseRecord,
  publishable,
  publishableLicence,
  recordJson,
} from './record.ts';
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
export {
  basisuAdapter,
  basisuArgs,
  gltfpackAdapter,
  gltfpackArgs,
  type ToolAdapterOptions,
} from './tool-adapters.ts';
export {
  nodeExec,
  runTool,
  setupFix,
  type ToolExec,
  type ToolExecOptions,
  type ToolProc,
} from './tool-spawn.ts';
export { validateOutputs } from './validate.ts';
export type { WireFetch, WireInit, WireReply } from './wire.ts';
