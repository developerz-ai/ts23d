// Public API of /kinds: domain builders (buildings, vehicles, vessels, vegetation) recipes compose.

export { type FacadeOptions, facade, type SetbackTier, type Side, setbacks } from './building.ts';
export { creature, hull, roof } from './planned.ts';
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
