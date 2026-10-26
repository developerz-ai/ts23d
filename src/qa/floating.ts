// Gate: everything is attached. A part is grounded if it reaches z≈0 or its SURFACE comes within
// CONTACT_EPS of a grounded part's surface — transitively. Bounding boxes are only the prefilter.

import {
  type Bounds,
  boundsOf,
  type CompiledAsset,
  type Mesh,
  worldMeshes,
} from '../core/index.ts';
import { surfaceSamples, TriangleGrid } from './geometry.ts';
import { CONTACT_EPS, type Finding, type Gate } from './types.ts';

const near = (a: Bounds, b: Bounds, eps: number): boolean =>
  [0, 1, 2].every(
    (k) => (a.min[k] ?? 0) <= (b.max[k] ?? 0) + eps && (b.min[k] ?? 0) <= (a.max[k] ?? 0) + eps,
  );

export function touching(a: Mesh, b: Mesh, grid: TriangleGrid, eps = CONTACT_EPS): boolean {
  const bb = boundsOf(b);
  for (const p of surfaceSamples(a, 0.1, 4)) {
    if (!near({ min: p, max: p }, bb, eps)) continue;
    if (grid.nearest(p, eps) <= eps) return true;
  }
  return false;
}

export const floatingParts: Gate = (asset: CompiledAsset): Finding[] => {
  const meshes = [...worldMeshes(asset.parts)];
  const bounds = new Map(meshes.map(([n, m]) => [n, boundsOf(m)]));
  const grids = new Map<string, TriangleGrid>();
  const grid = (n: string, m: Mesh): TriangleGrid => {
    const g = grids.get(n) ?? new TriangleGrid(m);
    grids.set(n, g);
    return g;
  };
  const grounded = new Set(
    meshes.filter(([n]) => (bounds.get(n)?.min[2] ?? 1) <= CONTACT_EPS).map(([n]) => n),
  );
  const frontier = [...grounded];
  while (frontier.length > 0) {
    const g = frontier.pop() ?? '';
    const gm = meshes.find(([n]) => n === g)?.[1];
    const gb = bounds.get(g);
    if (!gm || !gb) continue;
    for (const [n, m] of meshes) {
      const b = bounds.get(n);
      if (grounded.has(n) || !b || !near(b, gb, CONTACT_EPS)) continue;
      if (touching(m, gm, grid(g, gm)) || touching(gm, m, grid(n, m))) {
        grounded.add(n);
        frontier.push(n);
      }
    }
  }
  return meshes
    .filter(([n]) => !grounded.has(n))
    .map(([n]) => ({
      gate: 'floating-parts',
      part: n,
      message: `'${n}' has no surface within ${CONTACT_EPS * 100} cm of anything attached to the ground`,
      fix: 'move it onto what holds it (check `at`, parent and the LOD-gated detail around it) — bounding boxes touching is not enough',
    }));
};
