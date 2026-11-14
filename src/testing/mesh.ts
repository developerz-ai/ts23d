// Mesh-soundness assertions for a recipe's tests: watertight, 2-manifold, wound outward. Each takes
// a Mesh, a compiled asset or an Asset (per part, `parts` to narrow) and throws T3D_QA_FAILED with
// the count, where the first bad edge sits and the fix.
//   it('hull is watertight', () => assertClosed(tank, { parts: 'hull' }));
//   it('no inside-out faces', () => assertOutward(tank, { parts: ['hull', 'turret'] }));

import type { Vec3 } from '../core/index.ts';
import type { Finding } from '../qa/index.ts';
import { failOn } from './compiled.ts';
import { type MeshInput, type MeshScope, meshesOf } from './mesh-input.ts';
import { shellProbes } from './mesh-shells.ts';
import { fmtPoint, topology } from './mesh-topology.ts';

const label = (input: MeshInput): string => ('name' in input ? String(input.name) : 'mesh');

/** No boundary edges: every edge is shared by an even number of triangles (no holes). */
export function assertClosed(input: MeshInput, o: MeshScope = {}): void {
  failOn(
    `${label(input)} closed`,
    meshesOf(input, o).flatMap(({ name, mesh }) => {
      const t = topology(mesh);
      return t.boundary === 0
        ? []
        : [
            {
              finding: {
                gate: 'closed',
                code: 'T3D_QA_CLOSED',
                part: name,
                message: `'${name}' has ${t.boundary} open edge(s), first at ${fmtPoint(t.where.boundary)}`,
                fix: 'close the surface: add the missing cap/face (box omit, lathe caps, loft ends) or weld the seam so both sides share its vertices',
              },
            },
          ];
    }),
  );
}

/** Every edge joins exactly two triangles, walked once each way (no fins, no flipped neighbour). */
export function assertManifold(input: MeshInput, o: MeshScope = {}): void {
  failOn(
    `${label(input)} manifold`,
    meshesOf(input, o).flatMap(({ name, mesh }) => {
      const t = topology(mesh);
      const out: Finding[] = [];
      if (t.nonManifold > 0)
        out.push({
          gate: 'manifold',
          code: 'T3D_QA_MANIFOLD',
          part: name,
          message: `'${name}' has ${t.nonManifold} edge(s) shared by 3+ triangles, first at ${fmtPoint(t.where.nonManifold)}`,
          fix: 'split the touching solids into separate parts, or remove the internal wall/fin',
        });
      if (t.misoriented > 0)
        out.push({
          gate: 'manifold',
          code: 'T3D_QA_MANIFOLD',
          part: name,
          message: `'${name}' has ${t.misoriented} edge(s) whose two triangles wind the same way, first at ${fmtPoint(t.where.misoriented)}`,
          fix: 'a neighbour is flipped: wind every triangle counter-clockwise seen from outside (swap two indices of the odd one)',
        });
      return out.map((finding) => ({ finding }));
    }),
  );
}

export interface OutwardOptions extends MeshScope {
  /** Triangles probed per part (every n-th one). Default 2000. */
  readonly samples?: number;
}

// Three slightly tilted probe directions: a ray grazing a shared edge cannot flip the vote.
const TILTS: readonly Vec3[] = [
  [0.013, 0.007, 0.011],
  [-0.009, 0.015, -0.006],
  [0.006, -0.012, 0.014],
];

/**
 * Every face normal points out of its solid: a ray from the face centre along its winding normal
 * crosses its own shell an even number of times. Judged per connected shell (merged overlapping
 * solids each count alone); open shells are skipped (parity means nothing on a sheet) — run
 * assertClosed first. Probes about `samples` faces per part.
 */
export function assertOutward(input: MeshInput, o: OutwardOptions = {}): number {
  let worst = 0;
  failOn(
    `${label(input)} outward`,
    meshesOf(input, o).flatMap(({ name, mesh }) => {
      let inward = 0;
      let first: Vec3 | undefined;
      for (const p of shellProbes(mesh, o.samples ?? 2000)) {
        const n = p.normal;
        const votes = TILTS.filter((d) => {
          const v: Vec3 = [n[0] + d[0], n[1] + d[1], n[2] + d[2]];
          const l = Math.hypot(...v);
          return p.grid.cast(p.centre, [v[0] / l, v[1] / l, v[2] / l], p.tri).length % 2 === 1;
        }).length;
        if (votes >= 2) {
          inward++;
          first ??= p.centre;
        }
      }
      worst = Math.max(worst, inward);
      return inward === 0
        ? []
        : [
            {
              finding: {
                gate: 'outward',
                code: 'T3D_QA_OUTWARD',
                part: name,
                message: `'${name}' has ${inward} inward-facing triangle(s), first at ${fmtPoint(first)}`,
                fix: 'wind those triangles counter-clockwise seen from outside (swap two indices); a mirrored transform needs its winding reversed',
              },
            },
          ];
    }),
  );
  return worst;
}
