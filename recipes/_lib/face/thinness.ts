// Thin skin per vertex: how near the surface's own other side is behind it (an ear's rim and
// helix, a nostril's wing), 1 at the surface … 0 at `depth` or further. Light passes through
// such skin and leaves it blood-warm (backlit ears glow red-orange); the path tracer's diffusion
// shows that only when the light sits behind the ear, so the painter also warms thin rims in
// vertex colour, the way an engine without subsurface shows it too (D522).

import { dmath } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';

/** Per vertex of `m` (normals `n`): 1 − (distance to the nearest back-facing vertex behind it) /
 *  `depth`, clamped to 0 … 1. */
export function thinness(m: QuadMesh, n: Float64Array, depth: number): Float64Array {
  const P = m.p;
  const V = P.length / 3;
  const key = (x: number, y: number, z: number): string =>
    `${Math.floor(x / depth)},${Math.floor(y / depth)},${Math.floor(z / depth)}`;
  const grid = new Map<string, number[]>();
  for (let v = 0; v < V; v++) {
    const k = key(P[v * 3] ?? 0, P[v * 3 + 1] ?? 0, P[v * 3 + 2] ?? 0);
    const cell = grid.get(k);
    if (cell) cell.push(v);
    else grid.set(k, [v]);
  }
  const out = new Float64Array(V);
  for (let v = 0; v < V; v++) {
    const x = P[v * 3] ?? 0;
    const y = P[v * 3 + 1] ?? 0;
    const z = P[v * 3 + 2] ?? 0;
    const nx = n[v * 3] ?? 0;
    const ny = n[v * 3 + 1] ?? 0;
    const nz = n[v * 3 + 2] ?? 0;
    const cx = Math.floor(x / depth);
    const cy = Math.floor(y / depth);
    const cz = Math.floor(z / depth);
    let best = depth;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++)
          for (const u of grid.get(`${cx + i},${cy + j},${cz + k}`) ?? []) {
            const dx = (P[u * 3] ?? 0) - x;
            const dy = (P[u * 3 + 1] ?? 0) - y;
            const dz = (P[u * 3 + 2] ?? 0) - z;
            // Behind this vertex, facing the other way: the far side of a thin sheet.
            const behind = -(dx * nx + dy * ny + dz * nz);
            const facing =
              nx * (n[u * 3] ?? 0) + ny * (n[u * 3 + 1] ?? 0) + nz * (n[u * 3 + 2] ?? 0);
            if (behind <= 0 || facing > -0.3) continue;
            best = Math.min(best, dmath.hypot(dx, dy, dz));
          }
    out[v] = 1 - best / depth;
  }
  return out;
}
