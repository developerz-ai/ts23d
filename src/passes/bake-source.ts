// Where a part's surface came from, for the hero bake (ADR 012): a kind or recipe that meshed a
// signed-distance field tags the mesh it hands to `ctx.part` with that field, expressed in the
// mesh's own coordinates. The hero tier (finish/hero.ts) looks the tag up and bakes the field's
// fine detail onto the lighter mesh. A WeakMap keyed by the mesh object: no change to the mesh's
// data or bytes, and the tag dies with the mesh. A mesh that is copied (repaint, merge) loses it.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { DistanceField } from './bake-field.ts';

export interface BakeSource {
  /** Signed distance in the mesh's coordinates (metres, negative inside). */
  readonly field: DistanceField;
  /** Upper bound on |∇field| (a sculpt's `lipschitz`). Default 1.25. */
  readonly lipschitz?: number;
  /** Only the first `tris` triangles were meshed from the field (the rest merged in after, e.g.
   *  teeth): later triangles keep the mesh's own normal and are not bake rays. Default all. */
  readonly tris?: number;
  /** Linear RGB 0..1 at a surface point (the sculpt's own colour): the hero albedo at texel
   *  resolution instead of the mesh's vertex colour. */
  readonly color?: (p: Vec3) => Vec3;
}

const SOURCES = new WeakMap<Mesh, BakeSource>();

/** Tag `mesh` with the field it was meshed from; returns the same mesh. */
export function withBakeSource(mesh: Mesh, source: BakeSource): Mesh {
  SOURCES.set(mesh, source);
  return mesh;
}

export function bakeSourceOf(mesh: Mesh): BakeSource | undefined {
  return SOURCES.get(mesh);
}
