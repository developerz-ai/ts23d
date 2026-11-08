// Robust orientation predicates (Shewchuk-style): a floating-point evaluation with a proven
// error bound, and an exact fallback (BigInt over the doubles' exact values) only when the bound
// cannot decide the sign. Only the SIGN of the result is meaningful; it is always correct.
// Deterministic and dependency-free. Used by the ear clipper and the convex hull.

const EPS = 2 ** -53;
const CCW_BOUND = (3 + 16 * EPS) * EPS;
const O3D_BOUND = (7 + 56 * EPS) * EPS;
/** Below this the error bounds no longer hold (products may underflow): decide exactly. */
const TINY = 2 ** -900;

const view = new DataView(new ArrayBuffer(8));
/** The exact value of a finite double times 2^1074, as an integer. */
function big(x: number): bigint {
  if (x === 0) return 0n;
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (exp > 0) m |= 1n << 52n;
  const v = m << BigInt(Math.max(exp, 1) - 1);
  return hi >>> 31 ? -v : v;
}
const sign = (v: bigint): number => (v > 0n ? 1 : v < 0n ? -1 : 0);

/**
 * Twice the signed area of triangle (a, b, c): > 0 counter-clockwise, < 0 clockwise, 0 exactly
 * collinear. Same sign as (b − a) × (c − a).
 */
export function orient2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const l = (ax - cx) * (by - cy);
  const r = (ay - cy) * (bx - cx);
  const det = l - r;
  if (!Number.isFinite(det)) return det;
  const sum = Math.abs(l) + Math.abs(r);
  if (Math.abs(det) > CCW_BOUND * sum && sum > TINY) return det;
  const [Ax, Ay, Bx, By, Cx, Cy] = [big(ax), big(ay), big(bx), big(by), big(cx), big(cy)];
  return sign((Ax - Cx) * (By - Cy) - (Ay - Cy) * (Bx - Cx));
}

/**
 * Six times the signed volume of tetrahedron (a, b, c, d): > 0 when d lies on the side
 * (b − a) × (c − a) points to ("above" a counter-clockwise face), < 0 below, 0 exactly coplanar.
 */
export function orient3d(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  d: readonly [number, number, number],
): number {
  const adx = a[0] - d[0];
  const ady = a[1] - d[1];
  const adz = a[2] - d[2];
  const bdx = b[0] - d[0];
  const bdy = b[1] - d[1];
  const bdz = b[2] - d[2];
  const cdx = c[0] - d[0];
  const cdy = c[1] - d[1];
  const cdz = c[2] - d[2];
  const bc = bdx * cdy - cdx * bdy;
  const ca = cdx * ady - adx * cdy;
  const ab = adx * bdy - bdx * ady;
  // det[a − d; b − d; c − d] is negative when d is above: flip so above is positive.
  const det = -(adz * bc + bdz * ca + cdz * ab);
  if (!Number.isFinite(det)) return det;
  const permanent =
    (Math.abs(bdx * cdy) + Math.abs(cdx * bdy)) * Math.abs(adz) +
    (Math.abs(cdx * ady) + Math.abs(adx * cdy)) * Math.abs(bdz) +
    (Math.abs(adx * bdy) + Math.abs(bdx * ady)) * Math.abs(cdz);
  if (Math.abs(det) > O3D_BOUND * permanent && permanent > TINY) return det;
  const [Dx, Dy, Dz] = [big(d[0]), big(d[1]), big(d[2])];
  const [ax2, ay2, az2] = [big(a[0]) - Dx, big(a[1]) - Dy, big(a[2]) - Dz];
  const [bx2, by2, bz2] = [big(b[0]) - Dx, big(b[1]) - Dy, big(b[2]) - Dz];
  const [cx2, cy2, cz2] = [big(c[0]) - Dx, big(c[1]) - Dy, big(c[2]) - Dz];
  const exact =
    az2 * (bx2 * cy2 - cx2 * by2) + bz2 * (cx2 * ay2 - ax2 * cy2) + cz2 * (ax2 * by2 - bx2 * ay2);
  return 0 - sign(exact);
}
