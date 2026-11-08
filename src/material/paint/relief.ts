// Height-first detail helpers (the Substance chain: noise → height → normal / AO / curvature →
// roughness). Strip texels are anisotropic — about 1 mm along U but `scaleMetres / 64` (≈ 8 mm)
// along V at 2048² — so these samplers clamp each axis to what its texels can hold instead of
// scaling both together like `noiseAt`: fine detail survives along U, and `rowNoise` gives
// one-texel-tall lines along U (brushing, wood pores). `finishRelief` then derives cavity AO
// (into `occl`) and roughness from the painted height's curvature, so all maps agree.
// params (any kind, all default off): cavity 0 (AO strength 0..1) · cavityDepth 0.0004 (m of
//   concavity that counts as fully occluded) · cavityRadius 0.006 (m) · cavityRough 0 (added in
//   cavities; raised spots get 0.6× that much smoother)

import { type Canvas, type Grid, param } from './canvas.ts';
import { fbm, hash2 } from './noise.ts';
import { boxBlur } from './orm.ts';

/** Lattice cells across the canvas for a feature size: whole along U so strips tile. */
const cellsU = (c: Grid, size: number): number =>
  c.wrapU ? Math.max(1, Math.round(c.metresU / size)) : 1 << 20;

/** Finest feature (m) an fBm's top octave may reach on an axis of `texel` metres. */
const floor = (texel: number, octaves: number): number => 1.5 * texel * 2 ** (octaves - 1);

/**
 * Tileable fBm in [−1, 1]; each axis is clamped on its own so the finest octave still spans
 * ≥ 1.5 texels. Use it for features long along U (brushing); `isoNoise` for round ones.
 */
export function fineNoise(
  c: Grid,
  xm: number,
  ym: number,
  sizeU: number,
  sizeV: number,
  seed: number,
  octaves = 3,
): number {
  const su = Math.max(sizeU, floor(c.metresU / c.w, octaves));
  const sv = Math.max(sizeV, floor(c.metresV / c.h, octaves));
  const period = cellsU(c, su);
  const cell = c.wrapU ? c.metresU / period : su;
  return fbm(xm / cell, ym / sv, period, seed, octaves);
}

/** Round features (pits, stipple): both axes clamped to the coarser texel, aspect kept. */
export function isoNoise(c: Grid, xm: number, ym: number, size: number, seed: number, oct = 2) {
  const s = Math.max(size, floor(Math.max(c.metresU / c.w, c.metresV / c.h), oct));
  return fineNoise(c, xm, ym, s, s, seed, oct);
}

/** Tileable 1D fBm along U, independent per texel row `y`: streaks one texel tall. */
export function rowNoise(c: Grid, xm: number, y: number, sizeU: number, seed: number): number {
  const su = Math.max(sizeU, (1.5 * c.metresU) / c.w);
  const period = cellsU(c, su);
  const cell = c.wrapU ? c.metresU / period : su;
  return fbm(xm / cell, y, period, seed, 3);
}

/** Cellular (Worley) sample: distances in cell units and the nearest cell's hash. */
export interface Cell {
  f1: number;
  f2: number;
  id: number;
}

/**
 * Jittered-grid cells of `size` metres (isotropic, clamped to ≥ 2.5 texels on the coarser axis),
 * tileable along U. Writes into `out` to stay allocation-free in per-texel loops.
 */
export function worley(c: Grid, xm: number, ym: number, size: number, seed: number, out: Cell) {
  const s0 = Math.max(size, 2.5 * Math.max(c.metresU / c.w, c.metresV / c.h));
  const n = cellsU(c, s0);
  const s = c.wrapU ? c.metresU / n : s0;
  const gx = Math.floor(xm / s);
  const gy = Math.floor(ym / s);
  const u = xm / s;
  const v = ym / s;
  let f1 = 81;
  let f2 = 81;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (((gx + i) % n) + n) % n;
      const dx = u - (gx + i + hash2(cx, gy + j, seed));
      const dy = v - (gy + j + hash2(cx, gy + j, seed + 1));
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash2(cx, gy + j, seed + 2);
      } else if (d < f2) f2 = d;
    }
  out.f1 = Math.sqrt(f1);
  out.f2 = Math.sqrt(f2);
  out.id = id;
  return out;
}

/** Texture-space curvature, metres: height minus its local mean (+ convex, − concave). */
export function curvature(c: Canvas, radiusMetres: number): Float32Array {
  const rx = Math.max(1, Math.round(radiusMetres / (c.metresU / c.w)));
  const ry = Math.max(1, Math.round(radiusMetres / (c.metresV / c.h)));
  const blur = boxBlur(c.height, c.w, c.h, rx, ry, c.wrapU);
  const k = new Float32Array(c.height.length);
  for (let i = 0; i < k.length; i++) k[i] = (c.height[i] ?? 0) - (blur[i] ?? 0);
  return k;
}

/** Derive fine cavity AO and roughness from the height (no-op unless `cavity`/`cavityRough`). */
export function finishRelief(c: Canvas, params: Readonly<Record<string, number>> | undefined) {
  const ao = param(params, 'cavity', 0);
  const rough = param(params, 'cavityRough', 0);
  if (ao <= 0 && rough === 0) return;
  const depth = Math.max(1e-6, param(params, 'cavityDepth', 0.0004));
  const k = curvature(c, param(params, 'cavityRadius', 0.006));
  for (let i = 0; i < k.length; i++) {
    const v = (k[i] ?? 0) / depth;
    const pit = v < 0 ? Math.min(1, -v) : 0;
    const peak = v > 0 ? Math.min(1, v) : 0;
    c.occl[i] = (c.occl[i] ?? 1) * (1 - ao * 0.7 * pit);
    c.rough[i] = Math.min(1, Math.max(0, (c.rough[i] ?? 0.8) + rough * (pit - 0.6 * peak)));
  }
}
