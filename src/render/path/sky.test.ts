// The studio lights' samplers: each pdf matches where its samples land and integrates to one, the
// sun disc carries the requested irradiance, and the sky is brighter at the horizon than overhead.

import { describe, expect, it } from 'bun:test';
import { dmath } from '../../core/index.ts';
import { inDisc, makeSky, sampleSky, sampleSun, skyAt, skyPdf, sunPdf } from './sky.ts';

const sky = makeSky({ sun: [0.5, -0.3, Math.sqrt(1 - 0.34)], sunColor: [3, 2.8, 2.6] });
const d = new Float64Array(3);

describe('studio sky', () => {
  it('a wrong pdf fails the integral check (sanity of the check itself)', () => {
    let s = 0;
    const N = 4096;
    for (let i = 0; i < N; i++) s += skyPdf(sky, -1 + (2 * (i + 0.5)) / N) * 2 * 4 * Math.PI;
    expect(Math.abs(s / N - 1)).toBeGreaterThan(0.5);
  });

  it('sky pdf integrates to one over the sphere', () => {
    let s = 0;
    const N = 4096;
    for (let i = 0; i < N; i++) s += skyPdf(sky, -1 + (2 * (i + 0.5)) / N) * 4 * Math.PI;
    expect(Math.abs(s / N - 1)).toBeLessThan(1e-9);
  });

  it('sky samples carry the pdf of where they land, on the unit sphere', () => {
    for (let i = 0; i < 200; i++) {
      const p = sampleSky(sky, (i + 0.5) / 200, (i * 0.618) % 1, d);
      expect(dmath.hypot(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0)).toBeCloseTo(1, 9);
      expect(p).toBeCloseTo(skyPdf(sky, d[2] ?? 0), 9);
    }
  });

  it('sun samples stay inside the disc; the disc holds the asked irradiance', () => {
    for (let i = 0; i < 100; i++) {
      expect(sampleSun(sky, (i + 0.5) / 100, (i * 0.618) % 1, d)).toBeCloseTo(1 / sky.omega, 9);
      expect(inDisc(sky, d)).toBe(true);
      expect(sunPdf(sky, d)).toBeCloseTo(1 / sky.omega, 9);
    }
    expect(sunPdf(sky, [0, 0, -1])).toBe(0);
    expect((sky.sunL[0] ?? 0) * sky.omega).toBeCloseTo(3, 9);
  });

  it('is brightest at the horizon, cooler overhead, dim below', () => {
    expect(skyAt(sky, 0, 1)).toBeGreaterThan(skyAt(sky, 1, 1));
    expect(skyAt(sky, 1, 2)).toBeGreaterThan(skyAt(sky, 1, 0) * 1.2);
    expect(skyAt(sky, -1, 1)).toBeLessThan(skyAt(sky, 1, 1));
    expect(sky.pSun).toBeGreaterThan(0.3);
  });
});
