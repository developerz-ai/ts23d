import { describe, expect, test } from 'bun:test';
import type { Part, Socket } from '../core/index.ts';
import { DEFAULT_LAMP_LUMENS, DEFAULT_SUN_LUX, lightOf } from './lights.ts';

const socket = (data: Socket['data']): Part =>
  ({ name: 's', socket: { kind: 'light', data } }) as Part;
const intensity = (data: Socket['data']): number => {
  const l = lightOf(socket(data));
  return typeof l?.light['intensity'] === 'number' ? l.light['intensity'] : Number.NaN;
};

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
