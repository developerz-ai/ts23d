// Which side of a triangle the eye sees, for double-sided shading. An interpolated normal can tip
// past 90° from the eye on a grazing triangle that faces it, so it cannot answer this alone (lit
// as its back face, such a pixel prints a black line along a fold, D610). The triangle's own
// normal answers; the vertex normals only say which of its two sides is "front", so a mesh wound
// against its normals still shades right.

/**
 * True when the eye looks at the side of triangle (ia, ib, ic) opposite the shading normal `n`.
 * `ia`, `ib`, `ic` are offsets into `P` (x, y, z triples); `v` points from the surface to the eye.
 */
export function seenFromBehind(
  P: ArrayLike<number>,
  ia: number,
  ib: number,
  ic: number,
  nx: number,
  ny: number,
  nz: number,
  vx: number,
  vy: number,
  vz: number,
): boolean {
  const ax = P[ia] ?? 0;
  const ay = P[ia + 1] ?? 0;
  const az = P[ia + 2] ?? 0;
  const e1x = (P[ib] ?? 0) - ax;
  const e1y = (P[ib + 1] ?? 0) - ay;
  const e1z = (P[ib + 2] ?? 0) - az;
  const e2x = (P[ic] ?? 0) - ax;
  const e2y = (P[ic + 1] ?? 0) - ay;
  const e2z = (P[ic + 2] ?? 0) - az;
  const gx = e1y * e2z - e1z * e2y;
  const gy = e1z * e2x - e1x * e2z;
  const gz = e1x * e2y - e1y * e2x;
  const toNormal = gx * nx + gy * ny + gz * nz;
  const toEye = gx * vx + gy * vy + gz * vz;
  return toNormal < 0 ? toEye > 0 : toEye < 0;
}
