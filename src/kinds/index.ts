// Public API of /kinds: domain builders (buildings, vehicles, vessels, vegetation, creatures) recipes
// compose.

export { type FacadeOptions, facade, type SetbackTier, type Side, setbacks } from './building.ts';
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
export { creatureCreases } from './creature-creases.ts';
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
export {
  HEAD_RES,
  type HeadInfo,
  type HeadOptions,
  type HeadOverrides,
  head,
  headEdits,
  headParams,
} from './head.ts';
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
export { type OpeningOptions, type OpeningSide, opening } from './openings.ts';
export { type RoofInfo, type RoofMeshOptions, roof, roofInfo, roofMesh } from './roof.ts';
export type { RoofChimney } from './roof-chimney.ts';
export {
  type RoofOptions,
  type RoofSide,
  type RoofType,
  ridgeHeight,
  roofHeightAt,
} from './roof-shape.ts';
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
