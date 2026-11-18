// Public API of /kinds: domain builders (buildings, vehicles, vessels, vegetation, creatures) recipes
// compose.

export { bodyPlan } from './body-plan.ts';
export {
  type BodyPlanColours,
  type BodyPlanDefinition,
  type BodyPlanKit,
  defineBodyPlan,
} from './body-plan-asset.ts';
export type {
  BodyPlan,
  BodyPlanSpec,
  ChainRepeat,
  ChainSpec,
  PlanChain,
  PlanLink,
  SurfacePoint,
} from './body-plan-types.ts';
export { type FacadeOptions, facade, type SetbackTier, type Side, setbacks } from './building.ts';
export { bakeChainClip, type ChainClipSpec, type ChainDrive, loopLength } from './chain-bake.ts';
export {
  bendPulse,
  ds21Envelope,
  expEnvelope,
  followPath,
  hingeGroups,
  orthogonalWaves,
  serpenoid,
  travellingWave,
} from './chain-drivers.ts';
export {
  type ChainField,
  fadeField,
  MAX_JOINT_TWIST,
  poseChain,
  sumFields,
} from './chain-field.ts';
export {
  type CityInfo,
  type CityInstance,
  type CityOptions,
  type CityStreet,
  cityBlock,
  cityWindow,
  cityWindows,
  ROAD_WIDTH,
} from './city.ts';
export {
  type CityBuildingPlan,
  type CityFootprint,
  type CityPlanOptions,
  cityPlan,
  footprintIoU,
  hashId,
} from './city-plan.ts';
export {
  type CreatureDefinition,
  type CreatureInfo,
  type CreatureOptions,
  creature,
  creaturePlan,
  defineCreature,
} from './creature.ts';
export { ALLOMETRY_BAND, type Biology, biology, MAX_WING_LOADING } from './creature-biology.ts';
export { allometricLimbR, type Bones, massFromBones } from './creature-bones.ts';
export { creatureClips } from './creature-clips.ts';
export { creatureCreases } from './creature-creases.ts';
export {
  FAMILY_PRESETS,
  type FamilyMember,
  type FamilyPreset,
  type FamilyPresetName,
  familyMember,
  memberHead,
} from './creature-families.ts';
export {
  type CreatureFur,
  creatureFur,
  FUR_ZONES,
  type FurOptions,
  type FurZone,
  type FurZoneName,
  furChains,
  furZones,
} from './creature-fur.ts';
export { rigBones } from './creature-limits.ts';
export {
  type CreatureColours,
  type CreaturePattern,
  type CreatureSpec,
  checkCreature,
  type EarShape as CreatureEars,
  HEAD_PRESETS as CREATURE_HEAD_PRESETS,
  type HeadPreset as CreatureHeadPreset,
  type PatternKind,
  type Skeleton,
  type Stance,
  type Surface as CreatureSurface,
} from './creature-spec.ts';
export { GAITS, gaitTiming } from './gait.ts';
export { gaitClip } from './gait-bake.ts';
export { type GroomCardOptions, type GroomCards, groomCards } from './groom-cards.ts';
export {
  collisionMesh,
  type GroomCardShape,
  type GuideLayer,
  groomJson,
  reframe as groomReframe,
  type ScalpGuideOptions,
  type ScalpGuides,
  scalpGlb,
  scalpGuides,
} from './groom-guides.ts';
export {
  checkGroomOps,
  childrenFor,
  type GroomField,
  type GroomGuide,
  type GroomOp,
  type GroomOpName,
  type GroomRegion,
  isStrandOp,
  opMask,
  STRAND_OPS,
} from './groom-ops.ts';
export {
  type ApplyGroomOptions,
  applyGroomOps,
  curveLength,
  lockOf,
  resample as resampleCurve,
} from './groom-ops-apply.ts';
export {
  HEAD_RES,
  type HeadInfo,
  type HeadOptions,
  type HeadOverrides,
  head,
  headEdits,
  headParams,
} from './head.ts';
export { type FaceRig, faceMorphs, HEAD_MORPHS, headClips } from './head-clips.ts';
export { type CardLayer, hairEdits, type ScalpCardOptions, scalpCards } from './head-hair.ts';
export {
  type BeardStyle,
  type BustStyle,
  checkHead,
  type EarShape,
  type HairStyle,
  type HeadColors,
  type HeadParams,
} from './head-params.ts';
// Presets by race name (`head(ctx, { race: 'orc' })`); HEADS.orc etc. for tweaking. The bare
// preset names (`orc`, `human`) stay internal: too generic for the top-level barrel.
export { HEADS, type HeadPreset } from './head-presets.ts';
export {
  type HullColors,
  type HullLines,
  type HullMesh,
  type HullOptions,
  hull,
  hullMesh,
} from './hull.ts';
export { hullLines } from './hull-lines.ts';
export { type MassOptions, mass } from './mass.ts';
export { bindModel } from './model-bind.ts';
export {
  type ModelBodyInfo,
  type ModelBodyOptions,
  meshVolume,
  modelBody,
} from './model-body.ts';
export {
  type ChainedModel,
  type ModelChainOptions,
  modelChain,
  PROXY_TRIANGLES,
  proxySteps,
} from './model-chain.ts';
export { defineModelCharacter, type ModelCharacterDefinition } from './model-character.ts';
export {
  foldTargets,
  type RiggedBody,
  type RiggedBodyOptions,
  riggedBody,
} from './model-character-body.ts';
export { type RiggedChainOptions, riggedChain } from './model-character-chain.ts';
export { liftClip } from './model-character-clips.ts';
export { FUSED_HEAD_DROPS, type ModelClips, modelClips } from './model-clips.ts';
export { defineModelCreature, type ModelCreatureDefinition } from './model-creature.ts';
export { applyFit, FIT_LIMIT, type ModelFit, modelFit } from './model-fit.ts';
export { mapJoints, type RigTopology, rigTopology } from './model-joints.ts';
export { MIRROR_LIMIT, type MirrorResidual, mirrorResidual } from './model-mirror.ts';
export { REPOSE_LIMIT, type ReposeTarget, reposeTarget } from './model-repose.ts';
export { type ModelRig, type ModelRigOptions, modelRig } from './model-rig.ts';
export { type FittedSkeleton, fitSkeleton, type JointResidual } from './model-skeleton.ts';
export { type HydraOptions, hydraClips } from './neck-clips.ts';
export { type OpeningOptions, type OpeningSide, opening } from './openings.ts';
export { PULSE_PRESETS, type PulseSpec, radialPulseClip } from './radial-pulse.ts';
export { type RoofInfo, type RoofMeshOptions, roof, roofInfo, roofMesh } from './roof.ts';
export type { RoofChimney } from './roof-chimney.ts';
export {
  type RoofOptions,
  type RoofSide,
  type RoofType,
  ridgeHeight,
  roofHeightAt,
} from './roof-shape.ts';
export { type SnakeOptions, snakeClips } from './snake-clips.ts';
export { bakeSprings } from './springs.ts';
export { type SwimOptions, swimClips } from './swim-clips.ts';
export { SWIM_PRESETS, type SwimParams, type SwimPreset } from './swim-presets.ts';
export { type OctopusOptions, octopusClips } from './tentacle-clips.ts';
export { tread } from './tread.ts';
export {
  type TreeFamilyParams,
  type TreeInfo,
  type TreeOptions,
  tree,
  treeParams,
  treeReal,
  trees,
} from './vegetation.ts';
export type {
  BranchLevel,
  CrownShape,
  LeafParams,
  LeafShape,
  TreeParams,
} from './vegetation-params.ts';
export { birch, oak, palm, pine, SPECIES, type SpeciesName, willow } from './vegetation-presets.ts';
export { axle, propeller, trackRun, whyteAxles } from './vehicle.ts';
