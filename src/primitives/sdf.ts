// A signed-distance field meshed into a closed surface: rocks, boulders, terrain lumps, sculpted
// heads (sculpt.ts builds the field). SMOOTH normals from the field gradient (central differences),
// shared vertices. `resolution` is the cell edge in METRES, the LOD knob:
// `ctx.pick([0.01, 0.03, 0.08])`. Default mesher is surface nets (see surface-nets.ts for why);
// `mesher: 'cubes'` for marching cubes. `detail` boxes mesh finer (resolution / factor) and stitch
// into the same closed surface (surface-nets-detail.ts; nets only). UVs: planar along the normal's dominant axis, U at true
// metres, V mirrored every band so it never leaves the strip.
//   triangles = 2 × grid edges the surface crosses (nets) ≈ 2 · area / resolution² · 1.5

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { mappedOnto, type StripId, stripRect } from '../material/index.ts';
import { invalid } from './check.ts';
import type { DetailRegion } from './sdf-detail.ts';
import { sampleGrid } from './sdf-grid.ts';
import { mirroredV, stripU, stripVMetres } from './strip-uv.ts';
import { marchingCubes, surfaceNets } from './surface-nets.ts';
import { surfaceNetsDetail } from './surface-nets-detail.ts';

/** One colour, or one per vertex from its position and unit normal (moss on top, dark in cracks). */
export type SdfColor = Vec3 | ((p: Vec3, n: Vec3) => Vec3);

export interface SdfOptions {
  /** Signed distance in metres: negative inside. Must not keep the `p` it is given. */
  readonly field: (p: Vec3) => number;
  /** [min, max] corners; the surface is clipped to this box, so it is always closed. */
  readonly bounds: readonly [Vec3, Vec3];
  /** Cell edge in metres (the LOD knob). */
  readonly resolution: number;
  readonly color: SdfColor;
  readonly strip?: StripId;
  readonly mesher?: 'nets' | 'cubes';
  /** Upper bound on |∇field| (1 for exact distances). Raise it for strongly displaced fields so
   *  the sparse pass never skips a block that holds surface. Default 1.25. */
  readonly lipschitz?: number;
  /** 'y': the field is mirror-symmetric across y = 0 — snap the grid so the mesh is too. */
  readonly symmetry?: 'y';
  /** Boxes meshed at resolution / factor (face, paws), ≥ 1 cell apart; nets mesher only. */
  readonly detail?: readonly DetailRegion[];
}

export function sdf(o: SdfOptions): Mesh {
  const lip = o.lipschitz ?? 1.25;
  if (!(lip >= 1)) invalid(`sdf lipschitz is ${lip}`, 'use ≥ 1 (1 = exact distance field)');
  const detail = o.detail ?? [];
  if (detail.length > 0 && o.mesher === 'cubes')
    invalid('sdf detail regions need the nets mesher', "drop mesher: 'cubes' or the detail boxes");
  const g = sampleGrid(o.field, o.bounds, o.resolution, lip, o.symmetry === 'y', detail);
  const raw =
    o.mesher === 'cubes'
      ? marchingCubes(g)
      : g.detail.length > 0
        ? surfaceNetsDetail(g, g.detail)
        : surfaceNets(g);
  if (raw.tris.length === 0)
    invalid(
      'sdf field has no surface inside its bounds (never crosses zero)',
      'return negative distances inside the shape, positive outside, and make bounds contain it',
    );
  const strip = o.strip ?? 'plain';
  const rect = stripRect(strip);
  const vm = stripVMetres(strip);
  // Gradient step: half the finest cell (the coarse cell without detail).
  const e = (g.h * 0.5) / g.detail.reduce((f, d) => Math.max(f, d.f), 1);
  const q: [number, number, number] = [0, 0, 0];
  const at = (x: number, y: number, z: number): number => {
    q[0] = x;
    q[1] = y;
    q[2] = z;
    return g.field(q);
  };
  const b = new MeshBuilder();
  for (let i = 0; i < raw.pos.length; i += 3) {
    const x = raw.pos[i] ?? 0;
    const y = raw.pos[i + 1] ?? 0;
    const z = raw.pos[i + 2] ?? 0;
    const gx = at(x + e, y, z) - at(x - e, y, z);
    const gy = at(x, y + e, z) - at(x, y - e, z);
    const gz = at(x, y, z + e) - at(x, y, z - e);
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    const n: Vec3 = gl > 0 ? [gx / gl, gy / gl, gz / gl] : [0, 0, 1];
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    // Project onto the plane facing the normal's dominant axis; V runs with world up on walls.
    const [s, t] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [y, z] : [x, z];
    const p: Vec3 = [x, y, z];
    b.vertex({
      p,
      n,
      uv: [stripU(rect, s), mirroredV(rect, t, vm)],
      color: typeof o.color === 'function' ? o.color(p, n) : o.color,
    });
  }
  for (let i = 0; i < raw.tris.length; i += 3)
    b.tri(raw.tris[i] ?? 0, raw.tris[i + 1] ?? 0, raw.tris[i + 2] ?? 0);
  return mappedOnto(b.build(), strip);
}
