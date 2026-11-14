// assertMinThickness: no wall thinner than a minimum. From each probed face centre a ray goes
// inward (against the winding normal); the first surface it meets is the far side of the wall.
// Too thin for its size flickers, vanishes at distance and leaks light. Watertight parts only.
//   it('armour reads solid', () => assertMinThickness(tank, 0.01, { parts: 'hull' }));

import type { Vec3 } from '../core/index.ts';
import { failOn } from './compiled.ts';
import { type MeshInput, type MeshScope, meshesOf } from './mesh-input.ts';
import { shellProbes } from './mesh-shells.ts';
import { fmtPoint } from './mesh-topology.ts';

export interface ThicknessOptions extends MeshScope {
  /** Triangles probed per part. Default 2000. */
  readonly samples?: number;
}

const mm = (m: number): string => `${(m * 1000).toFixed(2)} mm`;

/** Thinnest wall per part, metres (Infinity when nothing was probed). */
export function wallThickness(
  input: MeshInput,
  o: ThicknessOptions = {},
): { name: string; min: number; at?: Vec3 }[] {
  return meshesOf(input, o).flatMap(({ name, mesh }) => {
    let min = Infinity;
    let at: Vec3 | undefined;
    for (const p of shellProbes(mesh, o.samples ?? 2000)) {
      const n = p.normal;
      const hit = p.grid.cast(p.centre, [-n[0], -n[1], -n[2]], p.tri, 1e-7)[0];
      if (hit && hit.t < min) {
        min = hit.t;
        at = p.centre;
      }
    }
    return [at ? { name, min, at } : { name, min }];
  });
}

/** Every watertight part is at least `metres` thick everywhere it was probed. Returns the thinnest. */
export function assertMinThickness(
  input: MeshInput,
  metres: number,
  o: ThicknessOptions = {},
): number {
  const walls = wallThickness(input, o);
  failOn(
    'thickness',
    walls
      .filter((w) => w.min < metres)
      .map((w) => ({
        finding: {
          gate: 'thickness',
          code: 'T3D_QA_THICKNESS',
          part: w.name,
          message: `'${w.name}' is ${mm(w.min)} thick at ${fmtPoint(w.at)}, minimum ${mm(metres)}`,
          fix: `thicken that wall to ≥ ${mm(metres)} (or make it a flat card with surface: 'cutout' if it is meant to be paper-thin)`,
        },
      })),
  );
  return Math.min(Infinity, ...walls.map((w) => w.min));
}
