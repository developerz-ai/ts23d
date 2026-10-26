// Primitives with a fixed signature and no body yet. The signature is the contract recipes are
// written against; each lands with its tests in the slice docs/plans/roadmap.md names.

import { type Mesh, notImplemented, type Vec3 } from '../core/index.ts';
import type { CellId, StripId } from '../material/index.ts';

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

/** Signed-distance blob meshed by marching cubes: rocks, stylised creatures, terrain lumps. M4. */
export function sdf(_o: {
  field: (p: Vec3) => number;
  bounds: readonly [Vec3, Vec3];
  resolution: number;
  color: Vec3;
}): Mesh {
  return notImplemented('sdf');
}
