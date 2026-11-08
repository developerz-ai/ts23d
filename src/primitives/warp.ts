// Landmark warp of a whole mesh: `warpTPS(mesh, from, to)` moves every vertex through the 3D
// thin-plate spline that takes each `from` landmark to its `to` landmark (warp-solve.ts), and
// turns every normal by the warp's inverse-transpose Jacobian, so shading stays right without a
// re-smooth. Topology, UVs and colours are kept: edge loops survive, which is the point — the
// tool for stylising a base mesh (a head into an orc, an elf) by moving named landmarks.

import type { Mesh, Vec3 } from '../core/index.ts';
import { type Tps, type TpsOptions, tpsWarp } from './warp-solve.ts';

export type WarpOptions = TpsOptions;

/** Normal transform for a warp with Jacobian J: cofactor(J) · n (∝ J^-T n), oriented by det J. */
function turn(J: readonly number[], n: Vec3): Vec3 {
  const [a = 1, b = 0, c = 0, d = 0, e = 1, f = 0, g = 0, h = 0, i = 1] = J;
  const C = [e * i - f * h, f * g - d * i, d * h - e * g];
  const C1 = [c * h - b * i, a * i - c * g, b * g - a * h];
  const C2 = [b * f - c * e, c * d - a * f, a * e - b * d];
  const det = a * (C[0] ?? 0) + b * (C[1] ?? 0) + c * (C[2] ?? 0);
  const sg = det < 0 ? -1 : 1;
  // The cofactor matrix's rows are C, C1, C2; cof(J) = det(J) · J^-T.
  const x = ((C[0] ?? 0) * n[0] + (C[1] ?? 0) * n[1] + (C[2] ?? 0) * n[2]) * sg;
  const y = ((C1[0] ?? 0) * n[0] + (C1[1] ?? 0) * n[1] + (C1[2] ?? 0) * n[2]) * sg;
  const z = ((C2[0] ?? 0) * n[0] + (C2[1] ?? 0) * n[1] + (C2[2] ?? 0) * n[2]) * sg;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Apply a solved warp to a mesh (positions moved, normals turned; everything else kept). */
export function applyWarp(mesh: Mesh, w: Tps): Mesh {
  const P = mesh.positions;
  const N = mesh.normals;
  const positions = new Float32Array(P.length);
  const normals = new Float32Array(N.length);
  for (let v = 0; v < P.length; v += 3) {
    const p: Vec3 = [P[v] ?? 0, P[v + 1] ?? 0, P[v + 2] ?? 0];
    const q = w.map(p);
    positions[v] = q[0];
    positions[v + 1] = q[1];
    positions[v + 2] = q[2];
    const n = turn(w.jacobian(p), [N[v] ?? 0, N[v + 1] ?? 0, N[v + 2] ?? 1]);
    normals[v] = n[0];
    normals[v + 1] = n[1];
    normals[v + 2] = n[2];
  }
  return {
    positions,
    normals,
    uvs: mesh.uvs.slice(),
    colors: mesh.colors.slice(),
    indices: mesh.indices.slice(),
  };
}

/**
 * Warp `mesh` so each `from[i]` landmark lands on `to[i]` (exactly at stiffness 0), everything
 * between following the smoothest (thin-plate) interpolation. ≥ 4 landmarks spanning 3D;
 * T3D_WARP_INVALID otherwise. Deterministic.
 */
export function warpTPS(
  mesh: Mesh,
  from: readonly Vec3[],
  to: readonly Vec3[],
  o: WarpOptions = {},
): Mesh {
  return applyWarp(mesh, tpsWarp(from, to, o));
}
