// BSDF white furnace: under uniform light of radiance 1 a white Lambert surface returns exactly 1
// and a white glTF dielectric (diffuse + GGX, split-sum energy split) stays within 1% of it; metal
// never creates energy; sampled pdfs equal evaluated pdfs; light from below the surface is black.

import { describe, expect, it } from 'bun:test';
import { OPAQUE } from '../looks.ts';
import { evalBsdf, lambertLobes, MODE, newLobes, prepare, sampleBsdf } from './bsdf.ts';
import { newSurf, type Surf } from './surf.ts';

function surf(albedo: number, rough: number, metal: number): Surf {
  const s = newSurf();
  s.n.set([0, 0, 1]);
  s.ng.set([0, 0, 1]);
  s.albedo.fill(albedo);
  s.rough = rough;
  s.metal = metal;
  s.look = OPAQUE;
  return s;
}

/** Mean f·cos ÷ pdf over a stratified grid of samples = directional albedo. */
function albedoOf(s: Surf, wo: number[], mode: number = MODE.pbr): number {
  const l = newLobes();
  if (mode === MODE.lambert) lambertLobes(s, l);
  else prepare(s, wo, mode, 0, l);
  const wi = new Float64Array(3);
  const w = new Float64Array(3);
  const n = 64;
  let sum = 0;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++)
      for (const u0 of [0.05, 0.35, 0.65, 0.95])
        if (sampleBsdf(s, l, wo, u0, (a + 0.5) / n, (b + 0.5) / n, wi, w) > 0) sum += w[0] ?? 0;
  return sum / (n * n * 4);
}

const wo45 = [Math.SQRT1_2, 0, Math.SQRT1_2];

describe('path BSDF', () => {
  it('returns black for light arriving from below the surface', () => {
    const s = surf(1, 0.5, 0);
    const l = newLobes();
    prepare(s, wo45, MODE.pbr, 0, l);
    const f = new Float64Array(3);
    expect(evalBsdf(s, l, wo45, [0, 0, -1], f)).toBe(0);
    expect(f[0]).toBe(0);
  });

  it('white furnace: white Lambert reflects exactly what arrives', () => {
    expect(Math.abs(albedoOf(surf(1, 0.5, 0), wo45, MODE.lambert) - 1)).toBeLessThan(0.01);
  });

  it('white furnace: a white dielectric stays within 1% of 1, any roughness', () => {
    for (const r of [0.2, 0.5, 0.9]) {
      const e = albedoOf(surf(1, r, 0), wo45);
      expect(e).toBeLessThan(1.01);
      expect(e).toBeGreaterThan(0.99);
    }
  });

  it('white furnace: white metal (multiple-scatter compensated) stays within 1% of 1', () => {
    for (const r of [0.1, 0.4, 0.8])
      expect(Math.abs(albedoOf(surf(1, r, 1), wo45) - 1)).toBeLessThan(0.01);
  });

  it('sampled pdf equals evaluated pdf', () => {
    const s = surf(0.6, 0.4, 0.3);
    const l = newLobes();
    prepare(s, wo45, MODE.pbr, 0, l);
    const wi = new Float64Array(3);
    const w = new Float64Array(3);
    const f = new Float64Array(3);
    for (let i = 0; i < 50; i++) {
      const p = sampleBsdf(s, l, wo45, (i * 0.37) % 1, (i + 0.5) / 50, (i * 0.618) % 1, wi, w);
      if (p > 0) expect(evalBsdf(s, l, wo45, wi, f)).toBeCloseTo(p, 9);
    }
  });

  it('foliage scatters through the leaf as well as back', () => {
    const s = surf(0.8, 0.6, 0);
    const l = newLobes();
    prepare(s, wo45, MODE.foliage, 0, l);
    const f = new Float64Array(3);
    expect(evalBsdf(s, l, wo45, [0, 0, -1], f)).toBeGreaterThan(0);
    expect(f[0]).toBeGreaterThan(0);
    expect(Math.abs(albedoOf(s, wo45, MODE.foliage) - 0.8)).toBeLessThan(0.01);
  });
});
