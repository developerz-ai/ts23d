// Weathering any strip by three dials (params, all 0..1, default 0 = no-op): `wear` rubs convex
// edges of the painted height (lighter, smoother, revealing albedo2), `age` adds grime, darkens
// and roughens, `wet` darkens porous albedo, lowers roughness and pools water in the low spots.
// Wet follows Lagarde's physically based wet surfaces (darkening grows with porosity, water film
// roughness → ~0.1, puddles flat and near-mirror); coefficients are approximations, see
// docs/architecture/materials.md#weathering. `porosity` 0..1 (default 0.6) scales the darkening.

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { grime } from './masks.ts';
import { curvature } from './relief.ts';

type Params = Readonly<Record<string, number>> | undefined;

function wearEdges(c: Canvas, amount: number, seed: number): void {
  const k = curvature(c, 0.006);
  let peak = 1e-9;
  for (const v of k) peak = Math.max(peak, v);
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let i = 0; i < k.length; i++) {
    const xm = ((i % c.w) + 0.5) * pu;
    const ym = (Math.floor(i / c.w) + 0.5) * pv;
    const chip = noiseAt(c, xm, ym, 0.02, 0.02, seed, 3);
    const m = smooth(1 - amount, 1.15 - amount, ((k[i] ?? 0) / peak) * (0.8 + 0.4 * chip) + 0.25);
    if (m <= 0) continue;
    c.tone[i] = (c.tone[i] ?? 1) * (1 + 0.18 * m);
    c.rough[i] = Math.max(0, (c.rough[i] ?? 0.8) - 0.2 * m);
    c.mix[i] = Math.min(1, (c.mix[i] ?? 0) + 0.7 * m);
  }
}

function soak(c: Canvas, wet: number, porosity: number): void {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of c.height) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  // Water fills the lowest share of the relief as wetness passes 0.5 (none below).
  const level = lo + (hi - lo) * 0.45 * smooth(0.5, 1, wet);
  const dark = wet * (0.15 + 0.45 * porosity);
  for (let i = 0; i < c.height.length; i++) {
    const h = c.height[i] ?? 0;
    const pool = level > lo && h < level ? smooth(0, 0.3 * (level - lo), level - h) : 0;
    c.tone[i] = (c.tone[i] ?? 1) * (1 - dark) * (1 - 0.1 * pool);
    const r = c.rough[i] ?? 0.8;
    const film = r + (0.12 - r) * wet * 0.85;
    c.rough[i] = film + (0.03 - film) * pool;
    if (pool > 0) c.height[i] = h + (level - h) * pool;
  }
}

/** Apply `wear`, `age` and `wet` from a strip's params (after its painter, before user paint). */
export function weather(c: Canvas, params: Params, seed: number): void {
  const wear = param(params, 'wear', 0);
  const age = param(params, 'age', 0);
  const wet = param(params, 'wet', 0);
  if (wear > 0) wearEdges(c, Math.min(1, wear), seed + 31);
  if (age > 0) {
    grime(c, Math.min(1, 0.7 * age), seed + 37);
    for (let i = 0; i < c.tone.length; i++) {
      c.tone[i] = (c.tone[i] ?? 1) * (1 - 0.12 * age);
      c.rough[i] = Math.min(1, (c.rough[i] ?? 0.8) + 0.08 * age);
    }
  }
  if (wet > 0) soak(c, Math.min(1, wet), param(params, 'porosity', 0.6));
}
