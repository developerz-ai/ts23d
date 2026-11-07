// Game-ready optimisation, run on every LOD before export, in meshoptimizer's order: weld
// duplicate vertices (index) → reorder triangles for the post-transform vertex cache (Forsyth)
// → reorder vertices for fetch locality. Same geometry, fewer vertices, fewer cache misses.
// Zero dependencies, byte-deterministic. Reports ACMR/ATVR before and after.

import type { Mesh } from '../core/index.ts';
import { cacheStats, fetchOrder, forsyth } from './optimize-cache.ts';
import { DEFAULT_WELD, type WeldTolerance, weld } from './optimize-weld.ts';

export interface OptimizeOptions {
  /** Merge vertices closer than this (metres) with matching normal/uv/colour. Default 1e-5. */
  readonly weldEpsilon?: number;
  /** Reorder for the vertex cache (Forsyth). Default true. */
  readonly vertexCache?: boolean;
}

export interface OptimizeReport {
  readonly verticesBefore: number;
  readonly verticesAfter: number;
  readonly trianglesBefore: number;
  readonly trianglesAfter: number;
  /** Zero-area / collapsed triangles dropped. */
  readonly degenerate: number;
  /** Exact duplicate triangles (same winding) dropped. */
  readonly duplicate: number;
  /** Average cache miss ratio per triangle before (FIFO 16). */
  readonly acmrBefore: number;
  /** Average cache miss ratio per triangle after reordering (lower is better, ~0.6–0.8 is good). */
  readonly acmr: number;
  /** Cache misses per vertex before / after (1.0 is ideal). */
  readonly atvrBefore: number;
  readonly atvr: number;
}

function reorderVertices(m: Mesh, order: Uint32Array, indices: Uint32Array): Mesh {
  const pick = (src: Float32Array, w: number): Float32Array => {
    const out = new Float32Array(order.length * w);
    for (let j = 0; j < order.length; j++)
      for (let k = 0; k < w; k++) out[j * w + k] = src[(order[j] ?? 0) * w + k] ?? 0;
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices,
  };
}

export function optimize(
  mesh: Mesh,
  o: OptimizeOptions = {},
): { mesh: Mesh; report: OptimizeReport } {
  const vBefore = mesh.positions.length / 3;
  const before = cacheStats(mesh.indices, vBefore);
  const tol: WeldTolerance = { ...DEFAULT_WELD, position: o.weldEpsilon ?? DEFAULT_WELD.position };
  const w = weld(mesh, tol);
  const vWelded = w.mesh.positions.length / 3;
  // Forsyth targets an LRU-32 cache; on already-good input (flat strips) it can lose a hair on
  // the FIFO-16 measure. Keep whichever order measures better — never make a mesh worse.
  const reordered = o.vertexCache === false ? null : forsyth(w.mesh.indices, vWelded);
  const tris =
    reordered && cacheStats(reordered, vWelded).acmr <= cacheStats(w.mesh.indices, vWelded).acmr
      ? reordered
      : w.mesh.indices;
  const fetched = fetchOrder(tris, vWelded);
  const out = reorderVertices(w.mesh, fetched.order, fetched.indices);
  const after = cacheStats(out.indices, out.positions.length / 3);
  return {
    mesh: out,
    report: {
      verticesBefore: vBefore,
      verticesAfter: out.positions.length / 3,
      trianglesBefore: mesh.indices.length / 3,
      trianglesAfter: out.indices.length / 3,
      degenerate: w.degenerate,
      duplicate: w.duplicate,
      acmrBefore: before.acmr,
      acmr: after.acmr,
      atvrBefore: before.atvr,
      atvr: after.atvr,
    },
  };
}
