// The simple kinds: 'noise' (a quiet painted/plain surface: soft tone and roughness mottling,
// faint relief), 'flat' (constant) and 'glass' (near-white, very smooth, faint ripples, smudges,
// grime toward the bottom edge).
// params (noise): tone 0.93 · mottle 0.03 · relief 0.0002 · size 0.3
// params (glass): ripple 0.0002 · smudge 0.08 · grime 0.4

import { type Canvas, noiseAt, param } from './canvas.ts';
import { grime } from './masks.ts';
import type { StripRecipe } from './types.ts';

export function paintFlat(c: Canvas, r: StripRecipe): void {
  c.tone.fill(param(r.params, 'tone', 1));
  c.rough.fill(r.roughness);
  c.metal.fill(r.metalness ?? 0);
  c.height.fill(0);
}

export function paintNoise(c: Canvas, r: StripRecipe, seed: number): void {
  const tone = param(r.params, 'tone', 0.93);
  const mottle = param(r.params, 'mottle', 0.03);
  const relief = param(r.params, 'relief', 0.0002);
  const size = param(r.params, 'size', 0.3);
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const metal = r.metalness ?? 0;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const big = noiseAt(c, xm, ym, size, size, seed, 4);
      const fine = noiseAt(c, xm, ym, 0.01, 0.01, seed + 1, 2);
      const i = y * c.w + x;
      c.tone[i] = tone + mottle * big;
      c.rough[i] = r.roughness + 0.06 * big + 0.03 * fine;
      c.metal[i] = metal;
      c.height[i] = relief * (big + 0.3 * fine);
    }
  }
}

export function paintGlass(c: Canvas, r: StripRecipe, seed: number): void {
  const ripple = param(r.params, 'ripple', 0.0002);
  const smudge = param(r.params, 'smudge', 0.08);
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const wave = noiseAt(c, xm, ym, 0.15, 0.4, seed, 3);
      const smear = noiseAt(c, xm, ym, 0.08, 0.08, seed + 1, 4);
      const i = y * c.w + x;
      c.tone[i] = 0.92 + 0.02 * wave;
      c.rough[i] = r.roughness + smudge * Math.max(0, smear);
      c.metal[i] = 0;
      c.height[i] = ripple * wave;
    }
  }
  grime(c, param(r.params, 'grime', 0.4), seed + 9);
}
