// Per-mesh memo of the indices QA gates share: bounds, the triangle spatial hash and the
// point-in-solid index. Gates run over the same world meshes (cached per parts array by core), so
// floating, clashes, occlusion and the inspector build each index once instead of once per gate.
// Keyed by mesh identity (WeakMap): meshes are immutable, and dropping the asset frees the indices.

import { type Bounds, boundsOf, type Mesh } from '../core/index.ts';
import { TriangleGrid } from './geometry.ts';
import { SolidIndex } from './inside.ts';

const bounds = new WeakMap<Mesh, Bounds>();
const grids = new WeakMap<Mesh, TriangleGrid>();
const solids = new WeakMap<Mesh, SolidIndex>();

const memo = <T>(map: WeakMap<Mesh, T>, m: Mesh, make: (m: Mesh) => T): T => {
  const hit = map.get(m);
  if (hit !== undefined) return hit;
  const made = make(m);
  map.set(m, made);
  return made;
};

/** `boundsOf(m)`, computed once per mesh. */
export const meshBounds = (m: Mesh): Bounds => memo(bounds, m, boundsOf);
/** A `TriangleGrid` over `m`, built once per mesh. */
export const triangleGrid = (m: Mesh): TriangleGrid => memo(grids, m, (x) => new TriangleGrid(x));
/** A `SolidIndex` over `m`, built once per mesh. */
export const solidIndex = (m: Mesh): SolidIndex => memo(solids, m, (x) => new SolidIndex(x));
