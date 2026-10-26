// Primitives with a fixed signature and no body yet. The signature is the contract recipes are
// written against; each lands with its tests in the slice docs/plans/roadmap.md names.

import { type Mesh, notImplemented, type Vec2, type Vec3 } from '../core/index.ts';
import type { CellId, StripId } from '../material/index.ts';

/** Extrude a closed 2D polygon (XY) up Z: footprints, hulls in plan, setback floors. M1. */
export function prism(_o: {
  polygon: readonly Vec2[];
  height: number;
  color: Vec3;
  strip?: StripId;
}): Mesh {
  return notImplemented('prism');
}

/** A square-section member between two points: girders, rods, rails, masts, truss chords. M1. */
export function beam(_o: {
  from: Vec3;
  to: Vec3;
  width: number;
  color: Vec3;
  strip?: StripId;
}): Mesh {
  return notImplemented('beam');
}

/** A quad tiling one trim strip at true scale: walls, roofs, decks. M1. */
export function tiled(_o: { origin: Vec3; u: Vec3; v: Vec3; color: Vec3; strip: StripId }): Mesh {
  return notImplemented('tiled');
}

/** A quad mapped to one fixed cell: windows, doors, clocks, signs. M1. */
export function cell(_o: {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  color: Vec3;
  cell: CellId;
  inset?: number;
}): Mesh {
  return notImplemented('cell');
}

/** Sweep a 2D section along a 3D path: handrails, pipes, cables, hull sheer lines. M2. */
export function sweep(_o: { section: readonly Vec2[]; path: readonly Vec3[]; color: Vec3 }): Mesh {
  return notImplemented('sweep');
}

/** Loft between sections: boat hulls, aircraft fuselages, bottle shapes. M2. */
export function loft(_o: { sections: readonly (readonly Vec3[])[]; color: Vec3 }): Mesh {
  return notImplemented('loft');
}

/** Signed-distance blob meshed by marching cubes: rocks, stylised creatures, terrain lumps. M4. */
export function sdf(_o: {
  field: (p: Vec3) => number;
  bounds: readonly [Vec3, Vec3];
  resolution: number;
  color: Vec3;
}): Mesh {
  return notImplemented('sdf');
}
