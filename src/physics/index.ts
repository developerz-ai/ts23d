// Public API of @developerz.ai/ts23d/physics: collision shapes fitted per part (box, sphere,
// capsule, cylinder, capped convex hull), mass / centre of mass / inertia from volume × density,
// friction and restitution per strip, and the `mass` QA check.

export { bodyKindOf, checkPhysics, type MassFinding, massFindings } from './check.ts';
export {
  AUTO_CONVEX_RATIO,
  type Collider,
  type ColliderFit,
  type ConvexFit,
  fitCollider,
  HULL_MAX_VERTICES,
  type MeshFit,
} from './collider.ts';
export { DENSITY, densityOf, materialAtV, triangleStrip } from './density.ts';
export {
  type BoxFit,
  fitBox,
  fitRound,
  fitSphere,
  MIN_SIZE,
  type RoundFit,
  type SphereFit,
} from './fit.ts';
export { convexHull, type Hull, hullVolume } from './hull.ts';
export { cappedHull, pointsOf, sphereDirections, supportPoints } from './hull-cap.ts';
export { eigenSym, type Mat3, quatFromAxes } from './linalg.ts';
export { type MassProperties, massProperties, type PartMass } from './mass.ts';
export { type Shell, shellsOf } from './shells.ts';
export { type PhysicsMaterial, physicsMaterialOf } from './surface.ts';
