// Breaks on an orc tusk (./tusks.ts `ivoryTusk`): a snapped end's jagged, stepped fracture and an
// old chip off the tip, both as fresher, paler ivory (D524).

import { dmath, type Mesh, type Vec3, weightedNormals } from '@developerz.ai/ts23d';

/** A tusk snapped off in a fight: the flat end cap and the last stretch before it pushed back
 *  along the tusk into a jagged, stepped fracture (high on one side, a few sharp teeth round
 *  the rim, a crater at the core), the break fresh pale dentine with dirt in its deepest notches
 *  (D524: a flat cap read as a clean-cut cylinder). `r` is the end's radius. */
export function snapEnd(m: Mesh, path: readonly Vec3[], r: number): Mesh {
  const N = path.length - 1;
  const e = path[N] ?? [0, 0, 0];
  const a = path[Math.max(0, N - 1)] ?? e;
  const d: Vec3 = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const L = dmath.hypot(d[0], d[1], d[2]) || 1;
  const t: Vec3 = [d[0] / L, d[1] / L, d[2] / L];
  // A frame across the end: u (any perpendicular), w = t × u.
  const ref: Vec3 = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u0: Vec3 = [
    ref[1] * t[2] - ref[2] * t[1],
    ref[2] * t[0] - ref[0] * t[2],
    ref[0] * t[1] - ref[1] * t[0],
  ];
  const ul = dmath.hypot(u0[0], u0[1], u0[2]) || 1;
  const u: Vec3 = [u0[0] / ul, u0[1] / ul, u0[2] / ul];
  const w: Vec3 = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
  // The fracture's depth below the end at angle θ round the rim (≤ 0.9 r: under the reach).
  const saw = (th: number): number => {
    const x = (th / (2 * Math.PI)) * 4 + 0.3 * dmath.sin(3 * th);
    return x - Math.floor(x);
  };
  const depth = (th: number, rim: number): number =>
    r * Math.max(0.05, 0.38 + 0.3 * dmath.cos(th - 0.6) + 0.26 * (saw(th) - 0.5)) * rim +
    0.55 * r * (1 - rim);
  const reach = 1.3 * r;
  const P = new Float32Array(m.positions);
  const C = new Float32Array(m.colors);
  for (let v = 0; v < P.length; v += 3) {
    const q: Vec3 = [(P[v] ?? 0) - e[0], (P[v + 1] ?? 0) - e[1], (P[v + 2] ?? 0) - e[2]];
    const along = q[0] * t[0] + q[1] * t[1] + q[2] * t[2];
    if (along < -reach) continue;
    const x = q[0] * u[0] + q[1] * u[1] + q[2] * u[2];
    const y = q[0] * w[0] + q[1] * w[1] + q[2] * w[2];
    const rad = dmath.hypot(x, y);
    const th = dmath.atan2(y, x);
    const rim = Math.min(1, rad / (0.7 * r));
    const k = Math.min(1, (along + reach) / reach);
    const back = depth(th, rim) * k;
    for (let c = 0; c < 3; c++) P[v + c] = (P[v + c] ?? 0) - (t[c] ?? 0) * back;
    // The break: fresh, paler dentine; dirt in the notches' floors.
    if (k > 0.85) {
      const notch = saw(th) > 0.82 && rim > 0.6 ? 0.45 : 0;
      for (let c = 0; c < 3; c++) {
        const fresh = Math.min(1, (C[v + c] ?? 0) * 1.12 + 0.05);
        C[v + c] = fresh + ((C[v + c] ?? 0) * 0.35 - fresh) * notch;
      }
    }
  }
  return weightedNormals({ ...m, positions: P, colors: C });
}

/** An old chip off the tip: everything past an oblique plane near the tip pressed onto it (a
 *  flat broken facet facing forward-up), the facet a fresher, paler ivory. */
export function chipTip(m: Mesh, path: readonly Vec3[]): Mesh {
  const N = path.length - 1;
  const a = path[Math.max(0, N - 2)] ?? [0, 0, 0];
  const b = path[N] ?? a;
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = dmath.hypot(d[0], d[1], d[2]) || 1;
  // The plane through the point 60 % of the way to the tip, its normal the tangent tilted forward.
  const o: Vec3 = [a[0] + d[0] * 0.6, a[1] + d[1] * 0.6, a[2] + d[2] * 0.6];
  const nr: Vec3 = [d[0] / L + 0.7, d[1] / L, d[2] / L];
  const nl = dmath.hypot(nr[0], nr[1], nr[2]) || 1;
  const nn: Vec3 = [nr[0] / nl, nr[1] / nl, nr[2] / nl];
  const P = new Float32Array(m.positions);
  const C = new Float32Array(m.colors);
  for (let v = 0; v < P.length; v += 3) {
    const h =
      ((P[v] ?? 0) - o[0]) * nn[0] +
      ((P[v + 1] ?? 0) - o[1]) * nn[1] +
      ((P[v + 2] ?? 0) - o[2]) * nn[2];
    if (h <= 0) continue;
    for (let k = 0; k < 3; k++) {
      P[v + k] = (P[v + k] ?? 0) - (nn[k] ?? 0) * h;
      C[v + k] = Math.min(1, (C[v + k] ?? 0) * 1.08 + 0.03);
    }
  }
  return weightedNormals({ ...m, positions: P, colors: C });
}
