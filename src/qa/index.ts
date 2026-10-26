// Public API of /qa: the gate every compiled asset passes before it ships.

export { clear, noOverlap, runChecks, symmetric, touches } from './checks.ts';
export { clashes } from './clash.ts';
export { floatingParts, touching } from './floating.ts';
export {
  DEFAULT_GATES,
  partNames,
  proportions,
  runQa,
  silhouetteIoU,
  triangleBudget,
} from './gates.ts';
export { pointTriangleDistance, surfaceSamples, TriangleGrid } from './geometry.ts';
export { insideSolid } from './inside.ts';
export { glob, type Inspector, inspect, type Penetration } from './inspect.ts';
export { measure, measures } from './measures.ts';
export { CLASH_EPS, CONTACT_EPS, type Finding, type Gate } from './types.ts';
