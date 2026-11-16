// Exact per-triangle queries for the mesh BVH: squared point–triangle distance with the closest
// point (Ericson, Real-Time Collision Detection 5.1.5) and the signed solid angle a triangle
// subtends at a point over 4π (Van Oosterom & Strackee 1983), the winding number's exact term.
// Triangles are 9 floats (a, b, c) at offset `o` of a flat array.

const FOUR_PI = 4 * Math.PI;

/** Squared distance from p to triangle abc; writes the closest point (Ericson, RTCD 5.1.5). */
export function pointTriangle(
  px: number,
  py: number,
  pz: number,
  t: Float64Array,
  o: number,
  out: number[] | null,
): number {
  const ax = t[o] ?? 0;
  const ay = t[o + 1] ?? 0;
  const az = t[o + 2] ?? 0;
  const abx = (t[o + 3] ?? 0) - ax;
  const aby = (t[o + 4] ?? 0) - ay;
  const abz = (t[o + 5] ?? 0) - az;
  const acx = (t[o + 6] ?? 0) - ax;
  const acy = (t[o + 7] ?? 0) - ay;
  const acz = (t[o + 8] ?? 0) - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let u = 0;
  let v = 0;
  const bpx = apx - abx;
  const bpy = apy - aby;
  const bpz = apz - abz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  const cpx = apx - acx;
  const cpy = apy - acy;
  const cpz = apz - acz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  const vc = d1 * d4 - d3 * d2;
  const vb = d5 * d2 - d1 * d6;
  const va = d3 * d6 - d5 * d4;
  if (d1 <= 0 && d2 <= 0) [u, v] = [0, 0];
  else if (d3 >= 0 && d4 <= d3) [u, v] = [1, 0];
  else if (d6 >= 0 && d5 <= d6) [u, v] = [0, 1];
  else if (vc <= 0 && d1 >= 0 && d3 <= 0) [u, v] = [d1 / (d1 - d3), 0];
  else if (vb <= 0 && d2 >= 0 && d6 <= 0) [u, v] = [0, d2 / (d2 - d6)];
  else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    [u, v] = [1 - w, w];
  } else {
    const den = 1 / (va + vb + vc);
    [u, v] = [vb * den, vc * den];
  }
  const qx = ax + abx * u + acx * v;
  const qy = ay + aby * u + acy * v;
  const qz = az + abz * u + acz * v;
  if (out) {
    out[0] = qx;
    out[1] = qy;
    out[2] = qz;
  }
  return (px - qx) ** 2 + (py - qy) ** 2 + (pz - qz) ** 2;
}

/** Signed solid angle of triangle (a, b, c) seen from p, over 4π. */
export function solidAngle(px: number, py: number, pz: number, t: Float64Array, o: number): number {
  const ax = (t[o] ?? 0) - px;
  const ay = (t[o + 1] ?? 0) - py;
  const az = (t[o + 2] ?? 0) - pz;
  const bx = (t[o + 3] ?? 0) - px;
  const by = (t[o + 4] ?? 0) - py;
  const bz = (t[o + 5] ?? 0) - pz;
  const cx = (t[o + 6] ?? 0) - px;
  const cy = (t[o + 7] ?? 0) - py;
  const cz = (t[o + 8] ?? 0) - pz;
  const la = Math.hypot(ax, ay, az);
  const lb = Math.hypot(bx, by, bz);
  const lc = Math.hypot(cx, cy, cz);
  const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const den =
    la * lb * lc +
    (ax * bx + ay * by + az * bz) * lc +
    (ax * cx + ay * cy + az * cz) * lb +
    (bx * cx + by * cy + bz * cz) * la;
  return (2 * Math.atan2(det, den)) / FOUR_PI;
}
