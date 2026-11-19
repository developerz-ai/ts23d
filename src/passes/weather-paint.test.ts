import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec3 } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { weather } from './weather.ts';

const bleached = (color: Vec3) =>
  weather(box({ size: [1, 1, 1], color }), {
    seed: 1,
    age: 1,
    effects: { bleach: { amount: 1 } },
  }).mesh.colors;

describe('weather — bleach', () => {
  it('never pushes a pale or saturated paint past linear 1 (QA vertex-colors)', () => {
    for (const color of [
      [1, 1, 1],
      [0.9, 0.9, 0.85],
      [1, 0.2, 0.2],
    ] as Vec3[]) {
      const out = bleached(color);
      expect(out.reduce((m, c) => Math.max(m, c), 0)).toBeLessThanOrEqual(1);
      expect(out.reduce((m, c) => Math.min(m, c), 1)).toBeGreaterThanOrEqual(0);
    }
  });

  it('still fades a mid-tone paint toward a lighter grey', () => {
    const out = bleached([0.2, 0.3, 0.2]);
    expect(out.reduce((m, c) => Math.max(m, c), 0)).toBeGreaterThan(0.3);
  });

  it('refuses an effect strength outside 0..1, with the fix', () => {
    for (const strength of [1.5, -0.2, Number.NaN]) {
      let caught: unknown;
      try {
        weather(box({ size: [1, 1, 1], color: [0.5, 0.5, 0.5] }), {
          seed: 1,
          effects: { dust: { strength } },
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Ts23dError);
      expect((caught as Ts23dError).code).toBe('T3D_RECIPE_INVALID');
      expect((caught as Ts23dError).message).toMatch(/dust\.strength/);
    }
  });
});
