// Public API of /kinds: domain builders (buildings, vehicles, vessels, vegetation) recipes compose.

export { type FacadeOptions, facade, type SetbackTier, type Side, setbacks } from './building.ts';
export { creature, hull, roof, tree } from './planned.ts';
export { axle, propeller, trackRun, whyteAxles } from './vehicle.ts';
