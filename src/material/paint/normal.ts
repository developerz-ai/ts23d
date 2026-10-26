// Normal from height: a Sobel gradient of the canvas height (metres) over its texel size (metres),
// so relief reads at true scale. glTF tangent space, +Y = toward decreasing V (OpenGL "green up").
// Wraps along U for strips, clamps for cells and along V.

import type { Canvas } from './canvas.ts';

/** Neighbour column indices, precomputed so the hot loop does no modulo. */
export function neighbours(n: number, wrap: boolean): { lo: Int32Array; hi: Int32Array } {
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    lo[i] = i > 0 ? i - 1 : wrap ? n - 1 : 0;
    hi[i] = i < n - 1 ? i + 1 : wrap ? 0 : n - 1;
  }
  return { lo, hi };
}

/** RGBA8 tangent-space normals for the canvas; `strength` scales the slope. */
export function sobelNormals(c: Canvas, strength = 1): Uint8Array {
  const { w, h, height } = c;
  const out = new Uint8Array(w * h * 4);
  const cx = neighbours(w, c.wrapU);
  const cy = neighbours(h, false);
  const sx = strength / (8 * (c.metresU / w));
  const sy = strength / (8 * (c.metresV / h));
  for (let y = 0; y < h; y++) {
    const r0 = (cy.lo[y] ?? 0) * w;
    const r1 = y * w;
    const r2 = (cy.hi[y] ?? 0) * w;
    for (let x = 0; x < w; x++) {
      const xl = cx.lo[x] ?? 0;
      const xr = cx.hi[x] ?? 0;
      const tl = height[r0 + xl] ?? 0;
      const tc = height[r0 + x] ?? 0;
      const tr = height[r0 + xr] ?? 0;
      const ml = height[r1 + xl] ?? 0;
      const mr = height[r1 + xr] ?? 0;
      const bl = height[r2 + xl] ?? 0;
      const bc = height[r2 + x] ?? 0;
      const br = height[r2 + xr] ?? 0;
      const gx = (tr + 2 * mr + br - tl - 2 * ml - bl) * sx;
      const gy = (bl + 2 * bc + br - tl - 2 * tc - tr) * sy;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const o = (r1 + x) * 4;
      out[o] = Math.round((-gx * inv * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((gy * inv * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}
