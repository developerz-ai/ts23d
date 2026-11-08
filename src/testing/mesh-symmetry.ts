// assertSymmetric: the surface mirrored across a plane lands back on the surface. Samples the
// world surface (vertices, edge points, face centres), reflects each across `axis` = `about`, and
// measures the distance to the nearest triangle. Tanks, cars and faces are mirror images left/right.
//   it('is symmetric left/right', () => assertSymmetric(tank, 'y', 0.01));

import { merge, type Vec3 } from '../core/index.ts';
import { surfaceSamples, TriangleGrid } from '../qa/index.ts';
import { failOn } from './compiled.ts';
import { type MeshInput, type MeshScope, meshesOf } from './mesh-input.ts';
import { fmtPoint } from './mesh-topology.ts';

export interface SymmetryOptions extends MeshScope {
  /** Mirror plane position along the axis, metres. Default 0 (the asset's centre line). */
  readonly about?: number;
  /** Surface samples checked (spread evenly). Default 8000. */
  readonly samples?: number;
}

const AXES = { x: 0, y: 1, z: 2 } as const;

/** Largest distance (m) from a mirrored surface sample to the surface, and where it was. */
export function asymmetry(
  input: MeshInput,
  axis: 'x' | 'y' | 'z',
  o: SymmetryOptions = {},
): { worst: number; at?: Vec3 } {
  const mesh = merge(meshesOf(input, o).map((m) => m.mesh));
  const k = AXES[axis];
  const plane = o.about ?? 0;
  const grid = new TriangleGrid(mesh);
  const all = surfaceSamples(mesh, 0.05, 8);
  const stride = Math.max(1, Math.ceil(all.length / (o.samples ?? 8000)));
  let worst = 0;
  let at: Vec3 | undefined;
  for (let i = 0; i < all.length; i += stride) {
    const p = all[i];
    if (!p) continue;
    const m: [number, number, number] = [p[0], p[1], p[2]];
    m[k] = 2 * plane - p[k];
    const d = grid.nearest(m, 1);
    const dist = Number.isFinite(d) ? d : 1;
    if (dist > worst) {
      worst = dist;
      at = p;
    }
  }
  return at ? { worst, at } : { worst };
}

/** Mirror image across `axis` = `about` within `tol` metres (default 1 cm) everywhere sampled. */
export function assertSymmetric(
  input: MeshInput,
  axis: 'x' | 'y' | 'z' = 'y',
  tol = 0.01,
  o: SymmetryOptions = {},
): number {
  const r = asymmetry(input, axis, o);
  const name = 'name' in input ? String(input.name) : 'mesh';
  failOn(
    `${name} symmetry`,
    r.worst <= tol
      ? []
      : [
          {
            finding: {
              gate: 'symmetric',
              message: `surface at ${fmtPoint(r.at)} has no mirror across ${axis} = ${o.about ?? 0}: nearest is ${r.worst >= 1 ? '≥ 1 m' : `${(r.worst * 100).toFixed(1)} cm`} away (tolerance ${(tol * 100).toFixed(1)} cm)`,
              fix: `build one side and mirror it (loop over side = ±1), or centre the asset on ${axis} = 0; pass { parts } to check only the parts meant to be symmetric`,
            },
          },
        ],
  );
  return r.worst;
}
