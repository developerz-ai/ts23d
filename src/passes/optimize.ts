// Game-ready optimisation, run on every LOD before export: weld duplicate vertices, reorder
// triangles for the post-transform vertex cache, then (in the GLB writer) quantise attributes
// (KHR_mesh_quantization) and optionally meshopt-compress. Detail up close, cheap to draw.
// Planned: M2 (docs/plans/roadmap.md) — zero-dependency implementations, byte-deterministic.

import { type Mesh, notImplemented } from '../core/index.ts';

export interface OptimizeOptions {
  /** Merge vertices closer than this (metres) with matching normal/uv/colour. */
  readonly weldEpsilon?: number;
  /** Reorder for the vertex cache (Forsyth/Tipsify-style). */
  readonly vertexCache?: boolean;
}

export interface OptimizeReport {
  readonly verticesBefore: number;
  readonly verticesAfter: number;
  /** Average cache miss ratio per triangle after reordering (lower is better, ~0.6–0.8 is good). */
  readonly acmr: number;
}

export function optimize(
  _mesh: Mesh,
  _o: OptimizeOptions = {},
): { mesh: Mesh; report: OptimizeReport } {
  return notImplemented('optimize (weld + vertex-cache reorder)');
}
