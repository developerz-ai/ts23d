import { describe, expect, it } from 'bun:test';
import { type Mesh, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { weather } from './weather.ts';
import { readOf } from './weather-read.ts';

const steel = (): Mesh => box({ size: [3, 2, 2], color: [0.05, 0.11, 0.24] });
const WET = { seed: 3, climate: 'wet', resolution: 0.08 } as const;

/** Area share of the side faces (below `top` metres) whose colour moved from the paint. */
function stained(m: Mesh, lo: number, hi: number): number {
  let [hit, all] = [0, 0];
  for (let v = 0; v < m.positions.length / 3; v++) {
    const z = m.positions[v * 3 + 2] ?? 0;
    if (Math.abs(m.normals[v * 3 + 2] ?? 0) > 0.5 || z < lo || z > hi) continue;
    all++;
    if (Math.abs((m.colors[v * 3 + 2] ?? 0) - 0.24) > 0.02) hit++;
  }
  return all ? hit / all : 0;
}

describe("weather read: 'hero'", () => {
  it('refuses an unknown reading distance', () => {
    try {
      weather(steel(), { ...WET, read: 'far' as 'hero' });
      throw new Error('expected a Ts23dError');
    } catch (e) {
      expect(e).toBeInstanceOf(Ts23dError);
      expect((e as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((e as Ts23dError).fix).toContain("'hero'");
    }
  });

  it("default is 'close', byte for byte, and leaves the faces above the splash band clean", () => {
    const base = weather(steel(), WET);
    expect(weather(steel(), { ...WET, read: 'close' })).toEqual(base);
    expect(readOf(WET, steel())).toBeNull();
    // The complaint: between 0.4 m and 1.0 m a 2 m side is untouched at the default reading.
    expect(stained(base.mesh, 0.4, 1.0)).toBeLessThan(0.05);
  });

  it('sizes the stains to the target: band, streaks, patches and default amounts', () => {
    const r = readOf({ read: 'hero' }, steel());
    expect(r?.cell).toBeCloseTo(0.18, 9); // 6 % of 3 m
    expect(r?.band).toBeCloseTo(0.5, 9);
    expect(r?.streak).toBeCloseTo(1, 9);
    // A 0.3 m stool: never smaller than the close look (cell from the look, 35 cm band).
    const small = readOf({ read: 'hero' }, box({ size: [0.3, 0.3, 0.3], color: [1, 1, 1] }));
    expect(small?.cell).toBeLessThan(0.03);
    expect(small?.band).toBe(0.35);
    const base = weather(steel(), WET);
    const hero = weather(steel(), { ...WET, read: 'hero' });
    expect(stained(hero.mesh, 0, 0.4)).toBeGreaterThan(0.8);
    expect(stained(hero.mesh, 0, 0.4)).toBeGreaterThan(stained(base.mesh, 0, 0.4) * 1.5);
    // The top of the box side stays paint: the wash ends with the band.
    expect(stained(hero.mesh, 1.2, 1.9)).toBeLessThan(0.1);
    const amount = (w: typeof base, k: string): number =>
      w.coverage.find((c) => c.effect === k)?.amount ?? 0;
    expect(amount(hero, 'mud')).toBeCloseTo(amount(base, 'mud') * 1.6, 4);
    for (const c of hero.coverage)
      if (c.area > 0) expect(Math.abs(c.actual - c.amount)).toBeLessThanOrEqual(c.tolerance);
  });

  it('never scales a declared amount or band, and stays deterministic', () => {
    const o = { ...WET, read: 'hero', groundBand: 0.2, effects: { mud: { amount: 0.1 } } } as const;
    const w = weather(steel(), o);
    expect(w.coverage.find((c) => c.effect === 'mud')?.amount).toBe(0.1);
    expect(stained(w.mesh, 0.45, 1.0)).toBeLessThan(0.05);
    expect(weather(steel(), o)).toEqual(w);
  });
});
