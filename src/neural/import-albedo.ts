// Getting an import onto the house material: its baseColor image projected into vertex colour
// (bilinear at each vertex UV, sRGB → linear, times the existing colour), and `onSheet` swapping
// the file's UVs for true-scale triplanar UVs on one trim-sheet strip — so an imported part keeps
// the ONE shared material and draw call (the default path; ADR 011).

import type { Mesh } from '../core/index.ts';
import {
  DEFAULT_SHEET,
  type Rgba,
  type StripId,
  stripRect,
  TRIM_SHEET_SIZE,
} from '../material/index.ts';

/** sRGB-encoded 0..1 → linear 0..1. */
export const toLinear = (s: number): number =>
  s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;

/** Bilinear RGBA8 sample at (u, v), wrapping (glTF REPEAT; v = 0 is the top row). 0..1 sRGB. */
export function sampleRgba(img: Rgba, u: number, v: number, out: number[]): void {
  const x = (u - Math.floor(u)) * img.width - 0.5;
  const y = (v - Math.floor(v)) * img.height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const W = img.width;
  const H = img.height;
  for (let k = 0; k < 4; k++) out[k] = 0;
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const w = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      const px = (((x0 + i) % W) + W) % W;
      const py = (((y0 + j) % H) + H) % H;
      const o = (py * W + px) * 4;
      for (let k = 0; k < 4; k++) out[k] = (out[k] ?? 0) + ((img.data[o + k] ?? 0) / 255) * w;
    }
}

export function projectAlbedo(m: Mesh, img: Rgba): Mesh {
  const colors = new Float32Array(m.colors);
  const s = [0, 0, 0, 0];
  for (let i = 0; i < colors.length / 3; i++) {
    sampleRgba(img, m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0, s);
    for (let k = 0; k < 3; k++) colors[i * 3 + k] = (colors[i * 3 + k] ?? 1) * toLinear(s[k] ?? 1);
  }
  return { ...m, colors };
}

/**
 * Replace UVs with true-scale triplanar UVs on `strip` (U tiles, V mirrored inside the band):
 * the sheet's micro-detail at real size, colour from the vertices. The file's UVs are dropped.
 */
export function onSheet(m: Mesh, strip: StripId = 'plain'): Mesh {
  const r = stripRect(strip);
  const vm = DEFAULT_SHEET.strips[strip]?.scaleMetres ?? 1;
  const half = 0.5 / TRIM_SHEET_SIZE;
  const uvs = new Float32Array((m.positions.length / 3) * 2);
  for (let i = 0; i < m.positions.length / 3; i++) {
    const [x, y, z] = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const ax = Math.abs(m.normals[i * 3] ?? 0);
    const ay = Math.abs(m.normals[i * 3 + 1] ?? 0);
    const az = Math.abs(m.normals[i * 3 + 2] ?? 0);
    const [s, t] = az >= ax && az >= ay ? [x, y] : ax >= ay ? [y, z] : [x, z];
    const f = t / vm - 2 * Math.floor(t / vm / 2);
    const band = f <= 1 ? f : 2 - f;
    uvs[i * 2] = r.u0 + (s / r.metres) * (r.u1 - r.u0);
    uvs[i * 2 + 1] = r.v0 + half + band * (r.v1 - r.v0 - 2 * half);
  }
  return { ...m, uvs };
}
