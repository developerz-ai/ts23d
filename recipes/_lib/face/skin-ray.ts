// Points ON the warped skin by direction: a ray from a point inside the head out along `dir`, the
// farthest crossing of the quad mesh (Möller–Trumbore on each quad's two triangles) — the scalp,
// not the inside of the mouth. Hair lines are built from these, so every lock starts on the skin
// whatever the race did to the cranium.

import type { Vec3 } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';

function hit(o: Vec3, d: Vec3, p: Float64Array, a: number, b: number, c: number): number {
  const ax = p[a * 3] ?? 0;
  const ay = p[a * 3 + 1] ?? 0;
  const az = p[a * 3 + 2] ?? 0;
  const e1x = (p[b * 3] ?? 0) - ax;
  const e1y = (p[b * 3 + 1] ?? 0) - ay;
  const e1z = (p[b * 3 + 2] ?? 0) - az;
  const e2x = (p[c * 3] ?? 0) - ax;
  const e2y = (p[c * 3 + 1] ?? 0) - ay;
  const e2z = (p[c * 3 + 2] ?? 0) - az;
  const hx = d[1] * e2z - d[2] * e2y;
  const hy = d[2] * e2x - d[0] * e2z;
  const hz = d[0] * e2y - d[1] * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return -1;
  const f = 1 / det;
  const sx = o[0] - ax;
  const sy = o[1] - ay;
  const sz = o[2] - az;
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return -1;
  const qx = sy * e1z - sz * e1y;
  const qy = sz * e1x - sx * e1z;
  const qz = sx * e1y - sy * e1x;
  const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
  if (v < 0 || u + v > 1) return -1;
  return f * (e2x * qx + e2y * qy + e2z * qz);
}

/** The farthest skin crossing from `o` along `dir` (or `o` itself when the ray misses). */
export function skinPoint(m: QuadMesh, o: Vec3, dir: Vec3): Vec3 {
  const l = Math.hypot(...dir) || 1;
  const d: Vec3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  let best = -1;
  for (let f = 0; f < m.q.length; f += 4) {
    const a = m.q[f] ?? 0;
    const b = m.q[f + 1] ?? 0;
    const c = m.q[f + 2] ?? 0;
    const e = m.q[f + 3] ?? 0;
    best = Math.max(best, hit(o, d, m.p, a, b, c), hit(o, d, m.p, a, c, e));
  }
  return best > 0 ? [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best] : o;
}
