// The LSCM chart gate's two measures: Sander et al.'s L2 stretch (area-weighted RMS of the
// UV → surface Jacobian's singular values, normalised so any uniform scale of an isometry reads 1)
// and a raster self-overlap test (two triangles covering one sample = the chart folds onto itself).

import { dmath } from '../core/index.ts';

export type V3 = [number, number, number];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** wa·a + wb·b + wc·c. */
const comb = (a: V3, b: V3, c: V3, wa: number, wb: number, wc: number): V3 => [
  a[0] * wa + b[0] * wb + c[0] * wc,
  a[1] * wa + b[1] * wb + c[1] * wc,
  a[2] * wa + b[2] * wb + c[2] * wc,
];

/** Sander L2 stretch of a chart's triangles (UV per node slot), area-normalised: 1 = isometric. */
export function stretchL2(tri3: readonly V3[][], tri2: readonly [number, number][][]): number {
  let s3 = 0;
  let s2 = 0;
  let acc = 0;
  tri3.forEach((q, i) => {
    const [p1, p2, p3] = tri2[i] ?? [];
    const [q1, q2, q3] = q;
    if (!p1 || !p2 || !p3 || !q1 || !q2 || !q3) return;
    const a2 = ((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1])) / 2;
    const a3 = dmath.norm(cross(sub(q2, q1), sub(q3, q1))) / 2;
    if (a3 < 1e-14) return;
    if (Math.abs(a2) < 1e-14) {
      acc += 1e6 * a3;
      s3 += a3;
      return;
    }
    const k = 1 / (2 * a2);
    const Ss = comb(q1, q2, q3, (p2[1] - p3[1]) * k, (p3[1] - p1[1]) * k, (p1[1] - p2[1]) * k);
    const St = comb(q1, q2, q3, (p3[0] - p2[0]) * k, (p1[0] - p3[0]) * k, (p2[0] - p1[0]) * k);
    acc += ((dot(Ss, Ss) + dot(St, St)) / 2) * a3;
    s3 += a3;
    s2 += Math.abs(a2);
  });
  return s3 > 0 ? Math.sqrt(acc / s3) * Math.sqrt(s2 / s3) : 1;
}

/** True when two triangles of the chart cover one sample (raster test at `res`² over its box). */
export function overlaps(tri2: readonly [number, number][][], res = 96): boolean {
  let lo = [Infinity, Infinity];
  let hi = [-Infinity, -Infinity];
  for (const t of tri2)
    for (const p of t) {
      lo = [Math.min(lo[0] ?? 0, p[0]), Math.min(lo[1] ?? 0, p[1])];
      hi = [Math.max(hi[0] ?? 0, p[0]), Math.max(hi[1] ?? 0, p[1])];
    }
  const span = Math.max((hi[0] ?? 0) - (lo[0] ?? 0), (hi[1] ?? 0) - (lo[1] ?? 0)) || 1;
  const cnt = new Uint8Array(res * res);
  let twice = 0;
  for (const t of tri2) {
    const [a, b, c] = t.map((p) => [
      (((p[0] - (lo[0] ?? 0)) / span) * res) as number,
      (((p[1] - (lo[1] ?? 0)) / span) * res) as number,
    ]);
    if (!a || !b || !c) continue;
    const area =
      ((b[0] ?? 0) - (a[0] ?? 0)) * ((c[1] ?? 0) - (a[1] ?? 0)) -
      ((c[0] ?? 0) - (a[0] ?? 0)) * ((b[1] ?? 0) - (a[1] ?? 0));
    if (Math.abs(area) < 1e-12) continue;
    const edge = (p: number[], q: number[], x: number, y: number): number =>
      (((q[0] ?? 0) - (p[0] ?? 0)) * (y - (p[1] ?? 0)) -
        ((q[1] ?? 0) - (p[1] ?? 0)) * (x - (p[0] ?? 0))) /
      area;
    const xs = [a[0] ?? 0, b[0] ?? 0, c[0] ?? 0];
    const ys = [a[1] ?? 0, b[1] ?? 0, c[1] ?? 0];
    for (
      let y = Math.max(0, Math.floor(Math.min(...ys)));
      y <= Math.min(res - 1, Math.ceil(Math.max(...ys)));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(...xs)));
        x <= Math.min(res - 1, Math.ceil(Math.max(...xs)));
        x++
      ) {
        const [px, py] = [x + 0.5, y + 0.5];
        // Strictly inside (a 1 % margin): shared edges never count twice.
        if (edge(b, c, px, py) > 0.01 && edge(c, a, px, py) > 0.01 && edge(a, b, px, py) > 0.01) {
          const i = y * res + x;
          if ((cnt[i] ?? 0) > 0) twice++;
          cnt[i] = 1;
        }
      }
  }
  return twice > 0;
}
