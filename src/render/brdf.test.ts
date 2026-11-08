// The reference BRDF pieces against their defining properties: GGX is a normalised
// distribution (∫ D cosθ dω = 1), the split-sum fit never creates energy, Smith visibility stays
// within its bound, refraction reports total internal reflection, thin films interfere.

import { describe, expect, it } from 'bun:test';
import { charlieD, envBrdf, ggxAnisoD, ggxD, refract, smithV, thinFilm } from './brdf.ts';

/** ∫ f(cosθ) cosθ dω over the hemisphere (θ midpoint rule, φ analytic). */
const integrate = (f: (c: number) => number, n = 20000): number => {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const t = ((i + 0.5) / n) * (Math.PI / 2);
    s += f(Math.cos(t)) * Math.cos(t) * Math.sin(t) * (Math.PI / 2 / n) * 2 * Math.PI;
  }
  return s;
};

describe('BRDF: failure cases first', () => {
  it('refraction from dense to thin past the critical angle reports false (TIR)', () => {
    const out = [0, 0, 0];
    const s = Math.sin((60 * Math.PI) / 180);
    expect(refract([s, 0, -Math.cos((60 * Math.PI) / 180)], [0, 0, 1], 1.5, out)).toBe(false);
    expect(refract([0, 0, -1], [0, 0, 1], 1 / 1.5, out)).toBe(true);
    expect(out[2]).toBeCloseTo(-1, 6);
  });
  it('the split-sum fit never reflects more than arrives (A + B ≤ 1)', () => {
    const ab = new Float64Array(2);
    for (let r = 0; r <= 1; r += 0.1)
      for (let c = 0.01; c <= 1; c += 0.1) {
        envBrdf(r, c, ab);
        expect((ab[0] ?? 0) + (ab[1] ?? 0)).toBeLessThanOrEqual(1.0001);
        expect(ab[0] ?? -1).toBeGreaterThanOrEqual(-1e-6);
      }
  });
});

describe('BRDF properties', () => {
  it('GGX D is normalised for any roughness; anisotropic GGX equals it when α_t = α_b', () => {
    for (const a of [0.05, 0.2, 0.5, 1]) expect(integrate((c) => ggxD(c, a))).toBeCloseTo(1, 2);
    expect(ggxAnisoD(0.8, 0.3, Math.sqrt(1 - 0.64 - 0.09), 0.3, 0.3)).toBeCloseTo(
      ggxD(0.8, 0.3),
      8,
    );
  });
  it('Smith visibility is positive and below 1 / (4 n·l n·v)', () => {
    for (const a of [0.05, 0.5, 1]) {
      const v = smithV(0.7, 0.6, a);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1 / (4 * 0.7 * 0.6) + 1e-9);
    }
  });
  it('Charlie sheen peaks at grazing half-vectors', () => {
    expect(charlieD(0.1, 0.25)).toBeGreaterThan(charlieD(0.99, 0.25));
  });
  it('a thin film tints: channels differ, and change with thickness', () => {
    const at = (d: number) => [0, 1, 2].map((k) => thinFilm(k, 2.2, d, 0.3, 1));
    const a = at(120);
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.2);
    expect(at(160)).not.toEqual(a);
    for (const v of [...a, ...at(160)]) expect(v >= 0 && v <= 1).toBe(true);
  });
});
