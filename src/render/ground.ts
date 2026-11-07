// The seamless studio floor as a shadow catcher: a world-space grid over the asset's footprint
// holding how much light reaches the floor (sun shadow × sky openness, 1 = untouched). The renderer
// multiplies the background by it, so the floor is invisible except for the shadows that ground
// the model — the clean product-shot look, with a soft contact shadow from the AO maps.

import type { PerspectiveCamera } from './camera.ts';
import { type ShadeContext, skyOpen, sunVisible } from './shade.ts';

export interface FloorGrid {
  readonly z: number;
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly size: number;
  readonly light: Float32Array;
}

const UP = [0, 0, 1];

export function floorGrid(c: ShadeContext, size: number): FloorGrid {
  const s = c.scene;
  const z = s.min[2];
  const h = s.max[2] - s.min[2];
  const half = Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1]) / 2 + Math.max(h * 1.4, 0.2);
  const cx = (s.min[0] + s.max[0]) / 2;
  const cy = (s.min[1] + s.max[1]) / 2;
  const cell = (2 * half) / size;
  const light = new Float32Array(size * size);
  const sunUp = Math.max(0, c.rig.sun[2]);
  // Floor radiance split: sun share vs sky share of an open floor, so shadows read as soft
  // (sky still lights the shadow) and the contact shadow comes from the AO term alone.
  const sunW = sunUp * (c.rig.sunColor[1] ?? 1);
  const skyW = c.rig.sky[1] ?? 1;
  const p = [0, 0, z];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      p[0] = cx - half + (i + 0.5) * cell;
      p[1] = cy - half + (j + 0.5) * cell;
      const sun = sunVisible(c, p, UP, (i + j * 2) & 3);
      const open = skyOpen(c, p, UP);
      light[j * size + i] = (sunW * sun * (0.55 + 0.45 * open) + skyW * open) / (sunW + skyW);
    }
  return { z, x0: cx - half, y0: cy - half, cell, size, light: blur(blur(light, size), size) };
}

/** 3 × 3 box blur (edges clamp): hides the grid's cell steps under perspective magnification. */
function blur(src: Float32Array, n: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.min(n - 1, Math.max(0, y + dy));
          const xx = Math.min(n - 1, Math.max(0, x + dx));
          s += src[yy * n + xx] ?? 1;
        }
      out[y * n + x] = s / 9;
    }
  return out;
}

/** Floor light where the eye ray through pixel (px, py) meets the floor; 1 off the grid/above. */
export function floorLight(g: FloorGrid, cam: PerspectiveCamera, px: number, py: number): number {
  const sx = (px - cam.cx) / cam.focal;
  const sy = -(py - cam.cy) / cam.focal;
  const dx = cam.f[0] + cam.r[0] * sx + cam.u[0] * sy;
  const dy = cam.f[1] + cam.r[1] * sx + cam.u[1] * sy;
  const dz = cam.f[2] + cam.r[2] * sx + cam.u[2] * sy;
  if (dz >= -1e-6) return 1;
  const t = (g.z - cam.eye[2]) / dz;
  const gx = (cam.eye[0] + dx * t - g.x0) / g.cell - 0.5;
  const gy = (cam.eye[1] + dy * t - g.y0) / g.cell - 0.5;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  if (ix < 0 || iy < 0 || ix >= g.size - 1 || iy >= g.size - 1) return 1;
  const fx = gx - ix;
  const fy = gy - iy;
  const L = g.light;
  const o = iy * g.size + ix;
  return (
    (L[o] ?? 1) * (1 - fx) * (1 - fy) +
    (L[o + 1] ?? 1) * fx * (1 - fy) +
    (L[o + g.size] ?? 1) * (1 - fx) * fy +
    (L[o + g.size + 1] ?? 1) * fx * fy
  );
}
