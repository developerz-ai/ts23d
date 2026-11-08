// Exposure per vertex, 0 (buried, facing away from the sun) .. 1 (open sky, full sun): half sky
// visibility (fixed cosine-weighted hemisphere of rays against the target and the ground plane),
// half direct sun (n·sun, zero when a ray toward the sun is blocked). Drives 'shaded', 'sunlit'
// and moss/bleach plausibility. Rays are fixed directions: no randomness, same bytes every run.

import type { Vec3 } from '../core/index.ts';
import { RayGrid } from './ray-grid.ts';
import type { Surface } from './weather-surface.ts';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export const DEFAULT_SUN: Vec3 = (() => {
  const v: Vec3 = [-0.45, 0.55, 0.7];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

export function exposure(s: Surface, sun: Vec3, samples: number, ground: number): Float32Array {
  const m = s.mesh;
  const grid = new RayGrid(m);
  const out = new Float32Array(s.vertices);
  const memo = new Map<string, number>();
  const sl = Math.hypot(...sun) || 1;
  const su: Vec3 = [sun[0] / sl, sun[1] / sl, sun[2] / sl];
  const reach = Math.max(1, (s.maxZ - s.minZ) * 2);
  for (let v = 0; v < s.vertices; v++) {
    let nx = m.normals[v * 3] ?? 0;
    let ny = m.normals[v * 3 + 1] ?? 0;
    let nz = m.normals[v * 3 + 2] ?? 1;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const key = `${s.group[v]},${Math.round(nx * 50)},${Math.round(ny * 50)},${Math.round(nz * 50)}`;
    const hit = memo.get(key);
    if (hit !== undefined) {
      out[v] = hit;
      continue;
    }
    const bias = 2e-3;
    const ox = (m.positions[v * 3] ?? 0) + nx * bias;
    const oy = (m.positions[v * 3 + 1] ?? 0) + ny * bias;
    const oz = (m.positions[v * 3 + 2] ?? 0) + nz * bias;
    // Tangent frame (Frisvad).
    const sg = nz >= 0 ? 1 : -1;
    const a = -1 / (sg + nz);
    const b = nx * ny * a;
    const t: Vec3 = [1 + sg * nx * nx * a, sg * b, -sg * nx];
    const bt: Vec3 = [b, sg + ny * ny * a, -ny];
    let open = 0;
    for (let i = 0; i < samples; i++) {
      const r = Math.sqrt((i + 0.5) / samples);
      const phi = i * GOLDEN;
      const d0 = r * Math.cos(phi);
      const d1 = r * Math.sin(phi);
      const d2 = Math.sqrt(Math.max(0, 1 - r * r));
      const wx = t[0] * d0 + bt[0] * d1 + nx * d2;
      const wy = t[1] * d0 + bt[1] * d1 + ny * d2;
      const wz = t[2] * d0 + bt[2] * d1 + nz * d2;
      if (wz < -1e-6) continue; // the ground plane: below the horizon is earth, not sky
      if (!grid.hit(ox, oy, oz, wx, wy, wz, reach)) open++;
    }
    const sky = samples > 0 ? open / samples : 1;
    const facing = nx * su[0] + ny * su[1] + nz * su[2];
    const lit = facing > 0 && !grid.hit(ox, oy, oz, su[0], su[1], su[2], reach) ? facing : 0;
    const e = 0.5 * sky + 0.5 * lit * (oz >= ground - 1e-3 ? 1 : 0);
    memo.set(key, e);
    out[v] = e;
  }
  return out;
}
