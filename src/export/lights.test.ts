import { describe, expect, test } from 'bun:test';
import { type Part, type Socket, Ts23dError } from '../core/index.ts';
import { DEFAULT_LAMP_LUMENS, DEFAULT_SUN_LUX, lightOf } from './lights.ts';

const socket = (data: Socket['data']): Part =>
  ({ name: 's', socket: { kind: 'light', data } }) as Part;
const intensity = (data: Socket['data']): number => {
  const l = lightOf(socket(data));
  return typeof l?.light['intensity'] === 'number' ? l.light['intensity'] : Number.NaN;
};

const refusal = (data: Socket['data']): string => {
  try {
    lightOf(socket(data));
  } catch (e) {
    if (e instanceof Ts23dError) return `${e.code}|${e.message}|${e.fix}`;
    throw e;
  }
  return 'accepted';
};
const cones = (data: Socket['data']): { inner: number; outer: number } => {
  const spot = lightOf(socket(data))?.light['spot'] as Record<string, number> | undefined;
  return { inner: spot?.['innerConeAngle'] ?? Number.NaN, outer: spot?.['outerConeAngle'] ?? -1 };
};

describe('light numbers a file cannot carry are refused', () => {
  test('a spot cone of 0 (infinite default candela, inner = outer) or below is refused', () => {
    expect(refusal({ light: 'spot', cone: 0 })).toMatch(
      /^T3D_RECIPE_INVALID\|.*'s': cone 0 .*cone: 25/,
    );
    expect(refusal({ light: 'spot', cone: -20 })).toMatch(/T3D_RECIPE_INVALID.*cone -20/);
    expect(refusal({ light: 'spot', cone: 120 })).toMatch(/cone 120 .*at most 89/);
    expect(refusal({ light: 'spot', cone: Number.NaN })).toMatch(/cone NaN/);
  });
  test('a negative or non-finite intensity, range or inner cone is refused', () => {
    expect(refusal({ light: 'point', intensity: -5 })).toMatch(/T3D_RECIPE_INVALID.*intensity -5/);
    expect(refusal({ light: 'spot', intensity: Infinity })).toMatch(/intensity Infinity/);
    expect(refusal({ light: 'point', range: -1 })).toMatch(/range -1/);
    expect(refusal({ light: 'spot', range: Number.NaN })).toMatch(/range NaN/);
    expect(refusal({ light: 'spot', inner: -3 })).toMatch(/inner -3/);
  });
  test('every accepted spot has a finite intensity and 0 ≤ inner < outer < π/2', () => {
    for (const data of [
      { cone: 0.001 },
      { cone: 89 },
      { cone: 22, inner: 12 },
      { cone: 20, inner: 20 },
      { cone: 20, inner: 60 },
      {},
    ]) {
      const { inner, outer } = cones({ light: 'spot', ...data });
      expect(inner).toBeGreaterThanOrEqual(0);
      expect(inner).toBeLessThan(outer);
      expect(outer).toBeLessThan(Math.PI / 2);
      expect(Number.isFinite(intensity({ light: 'spot', ...data }))).toBe(true);
    }
  });
  test('a cone on a point light is not read, so it is not refused', () => {
    expect(refusal({ light: 'point', cone: 0 })).toBe('accepted');
  });
});

describe('light defaults are physical units (KHR_lights_punctual: cd / lux)', () => {
  test('a default directional light is daylight, not 3 lux (near-black in physical engines)', () => {
    expect(intensity({ light: 'directional' })).toBe(DEFAULT_SUN_LUX);
    expect(DEFAULT_SUN_LUX).toBeGreaterThanOrEqual(30_000);
  });
  test('a default point light is a ~1000 lm bulb spread over 4π sr', () => {
    expect(intensity({ light: 'point' })).toBeCloseTo(DEFAULT_LAMP_LUMENS / (4 * Math.PI), 6);
  });
  test('a default spot puts the same lumens into its cone: narrower cone, more candela', () => {
    const wide = intensity({ light: 'spot', cone: 60 });
    const narrow = intensity({ light: 'spot', cone: 15 });
    const cone = (deg: number): number => 2 * Math.PI * (1 - Math.cos((deg * Math.PI) / 180));
    expect(wide).toBeCloseTo(DEFAULT_LAMP_LUMENS / cone(60), 6);
    expect(narrow).toBeGreaterThan(wide);
  });
  test('an authored intensity is kept as written', () => {
    expect(intensity({ light: 'spot', intensity: 400 })).toBe(400);
  });
});
