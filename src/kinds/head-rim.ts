// Seamless split: a mesher rounds the edge where the jaw cut meets the skin by about one cell, so
// the head and jaw would show a groove along the cut. This pass snaps every vertex near that rim
// back onto the exact surfaces — skin vertices onto skull = 0, cut-face vertices onto cut = 0, both
// clamped to their side — and gives skin vertices the skull's own normal, so the two parts meet on
// one crease line with matching shading.

import type { Mesh, Vec3 } from '../core/index.ts';

/** A mutable point/vector (core's Vec3 is readonly). */
type P3 = [number, number, number];

import type { Field } from '../primitives/index.ts';

function grad(f: Field, p: Vec3, e: number, out: P3): number {
  const q: P3 = [p[0], p[1], p[2]];
  const at = (dx: number, dy: number, dz: number): number => {
    q[0] = p[0] + dx;
    q[1] = p[1] + dy;
    q[2] = p[2] + dz;
    return f(q);
  };
  out[0] = (at(e, 0, 0) - at(-e, 0, 0)) / (2 * e);
  out[1] = (at(0, e, 0) - at(0, -e, 0)) / (2 * e);
  out[2] = (at(0, 0, e) - at(0, 0, -e)) / (2 * e);
  return f(p);
}

/** Newton step of `p` towards f = 0 (only when f > 0 if `onlyOutside`). */
function project(f: Field, p: P3, e: number, onlyOutside: boolean): void {
  const g: P3 = [0, 0, 0];
  const v = grad(f, p, e, g);
  if (onlyOutside && v <= 0) return;
  const gg = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
  if (gg < 1e-12) return;
  for (let k = 0; k < 3; k++) p[k] = (p[k] ?? 0) - (v * (g[k] ?? 0)) / gg;
}

/** Part ≈ max(skull, side); `side` is the cut field signed so the part is where side < 0;
 *  `part` is the part's full field (with ears/tusks), so their vertices are left alone. */
export function sharpenRim(m: Mesh, skull: Field, side: Field, part: Field, res: number): Mesh {
  const positions = new Float32Array(m.positions);
  const normals = new Float32Array(m.normals);
  const e = res * 0.25;
  const gs: P3 = [0, 0, 0];
  const gc: P3 = [0, 0, 0];
  for (let i = 0; i < positions.length; i += 3) {
    const p: P3 = [positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0];
    // The cut is cheap and analytic; the skull is the costly sculpt — test the cut first.
    if (Math.abs(side(p)) > res * 2) continue;
    const c = grad(side, p, e, gc);
    const s = grad(skull, p, e, gs);
    if (Math.abs(s) > res * 2) continue;
    // Skip where an extra (ear, tusk) owns the surface.
    if (part(p) < Math.max(s, c) - res * 0.5) continue;
    const n: Vec3 = [normals[i] ?? 0, normals[i + 1] ?? 0, normals[i + 2] ?? 0];
    const ls = Math.hypot(...gs) || 1;
    const lc = Math.hypot(...gc) || 1;
    const onSkin =
      (n[0] * gs[0] + n[1] * gs[1] + n[2] * gs[2]) / ls >=
      (n[0] * gc[0] + n[1] * gc[1] + n[2] * gc[2]) / lc;
    for (let k = 0; k < 4; k++) {
      if (onSkin) {
        project(skull, p, e, false);
        project(side, p, e, true);
      } else {
        project(side, p, e, false);
        project(skull, p, e, true);
      }
    }
    // Within ~half a cell of the other surface: snap onto the crease line itself, so no bevel
    // strip (seen from outside as a dark groove) is left between skin and cut face.
    const other = onSkin ? side(p) : skull(p);
    if (other > -res * 0.6)
      for (let k = 0; k < 6; k++) {
        project(skull, p, e, false);
        project(side, p, e, false);
      }
    positions[i] = p[0];
    positions[i + 1] = p[1];
    positions[i + 2] = p[2];
    if (onSkin) {
      grad(skull, p, e, gs);
      const l = Math.hypot(...gs) || 1;
      normals[i] = gs[0] / l;
      normals[i + 1] = gs[1] / l;
      normals[i + 2] = gs[2] / l;
    }
  }
  return { ...m, positions, normals };
}

/**
 * Where a field gradient smears across a hard crease (the jaw cut at coarse cells), a vertex
 * normal can oppose its triangles; those vertices take their area-weighted face normal instead.
 */
export function creaseNormals(m: Mesh, minDot = 0.2): Mesh {
  const P = m.positions;
  const acc = new Float64Array(P.length);
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = (m.indices[t] ?? 0) * 3;
    const b = (m.indices[t + 1] ?? 0) * 3;
    const c = (m.indices[t + 2] ?? 0) * 3;
    const ux = (P[b] ?? 0) - (P[a] ?? 0);
    const uy = (P[b + 1] ?? 0) - (P[a + 1] ?? 0);
    const uz = (P[b + 2] ?? 0) - (P[a + 2] ?? 0);
    const vx = (P[c] ?? 0) - (P[a] ?? 0);
    const vy = (P[c + 1] ?? 0) - (P[a + 1] ?? 0);
    const vz = (P[c + 2] ?? 0) - (P[a + 2] ?? 0);
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, c])
      for (let k = 0; k < 3; k++) acc[v + k] = (acc[v + k] ?? 0) + (n[k] ?? 0);
  }
  const normals = new Float32Array(m.normals);
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(acc[i] ?? 0, acc[i + 1] ?? 0, acc[i + 2] ?? 0);
    if (l < 1e-20) continue;
    const f = [(acc[i] ?? 0) / l, (acc[i + 1] ?? 0) / l, (acc[i + 2] ?? 0) / l];
    const d =
      (normals[i] ?? 0) * (f[0] ?? 0) +
      (normals[i + 1] ?? 0) * (f[1] ?? 0) +
      (normals[i + 2] ?? 0) * (f[2] ?? 0);
    if (d >= minDot) continue;
    normals[i] = f[0] ?? 0;
    normals[i + 1] = f[1] ?? 0;
    normals[i + 2] = f[2] ?? 0;
  }
  return { ...m, normals };
}
