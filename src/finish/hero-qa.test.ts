import { describe, expect, test } from 'bun:test';
import { checkHero, densityRatio, type HeroPartStat } from './hero-qa.ts';

const TPM = 1000;
/** A part of `area` m² covering `k` × the texels its area asks for. */
const part = (name: string, area: number, k: number, hitRate: number | null): HeroPartStat => ({
  name,
  area,
  texels: Math.round(area * TPM * TPM * k),
  hitRate,
});
const base = { size: 2048, texelsPerMetre: TPM, cage: 0.012 };

describe('checkHero', () => {
  test('1 % of rays missing fails, 0.9 % passes', () => {
    const f = checkHero({ ...base, parts: [part('body', 0.5, 1, 0.99)] });
    expect(f.map((x) => [x.code, x.part])).toEqual([['T3D_BAKE_FAILED', 'body']]);
    expect(f[0]?.message).toContain('12.0 mm cage');
    expect(checkHero({ ...base, parts: [part('body', 0.5, 1, 0.991)] })).toEqual([]);
  });

  test('texel density off by more than 20 % fails; within passes', () => {
    const f = checkHero({ ...base, parts: [part('leg', 0.1, 0.6, 1)] });
    expect(f[0]?.message).toContain('texel density 77%');
    expect(checkHero({ ...base, parts: [part('leg', 0.1, 0.7, 1)] })).toEqual([]);
    // Too small to measure: skipped.
    expect(checkHero({ ...base, parts: [part('tooth', 1e-5, 0.1, null)] })).toEqual([]);
  });

  test('a bake larger than budget.heroTextures fails', () => {
    const f = checkHero({ ...base, cap: 1024, parts: [] });
    expect(f[0]?.message).toContain('budget.heroTextures.size is 1024');
    expect(checkHero({ ...base, cap: 2048, parts: [] })).toEqual([]);
  });

  test('densityRatio', () => {
    expect(densityRatio(part('a', 0.2, 1.44, 1), TPM)).toBeCloseTo(1.2, 3);
    expect(densityRatio({ name: 'z', area: 0, texels: 0, hitRate: null }, TPM)).toBe(1);
  });
});
