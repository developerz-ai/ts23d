// Strand lobes: never more energy out than in, darker fibres reflect less, the primary highlight
// sits off the mirror direction (cuticle tilt), and forward scatter is brighter than sideways.

import { describe, expect, it } from 'bun:test';
import { evalHair, sampleSphere } from './hair.ts';

const T = [0, 0, 1];
const f = new Float64Array(3);
const wi = new Float64Array(3);

/** Directional albedo of a strand (card facing wo) by stratified uniform-sphere quadrature. */
function energy(albedo: number, wo: number[]): number {
  let s = 0;
  const n = 300;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const p = sampleSphere((a + 0.5) / n, (b + 0.5) / n, wi);
      evalHair(T, wo, [albedo, albedo, albedo], 0.5, wo, wi, f);
      s += (f[0] ?? 0) / p;
    }
  return s / (n * n);
}

describe('hair lobes', () => {
  it('a black fibre still shows a white primary highlight but little else', () => {
    expect(energy(0, [1, 0, 0])).toBeLessThan(0.2);
    expect(energy(0, [1, 0, 0])).toBeGreaterThan(0.01);
  });

  it('white fibres conserve energy from any view', () => {
    for (const wo of [
      [1, 0, 0],
      [0.6, 0, 0.8],
      [0, 0.6, -0.8],
      [0, 0, 1],
    ]) {
      const e = energy(1, wo);
      expect(e).toBeLessThan(1);
      expect(e).toBeGreaterThan(0.5);
    }
  });

  it('puts the R highlight off the mirror direction (cuticle tilt)', () => {
    const wo = [1, 0, 0];
    const at = (deg: number): number => {
      const a = (deg * Math.PI) / 180;
      evalHair(T, wo, [0, 0, 0], 0.2, wo, [Math.cos(a), 0, Math.sin(a)], f);
      return f[0] ?? 0;
    };
    // Mirror about the strand normal is θi = −θo = 0; the tilt moves the peak to θi ≈ 2α ≠ 0.
    expect(at(-8)).toBeGreaterThan(at(8));
  });

  it('scatters forward through the fibre more than sideways', () => {
    const wo = [1, 0, 0];
    evalHair(T, [0, 0, 0], [0.8, 0.8, 0.8], 0.3, wo, [-1, 0, 0], f);
    const forward = f[0] ?? 0;
    evalHair(T, [0, 0, 0], [0.8, 0.8, 0.8], 0.3, wo, [0, 1, 0], f);
    expect(forward).toBeGreaterThan(f[0] ?? 0);
  });
});
