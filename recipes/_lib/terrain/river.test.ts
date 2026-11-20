// River meanders. Failure first: the least-cost floor path is a straight run (it read as a road);
// meandered, it must leave the line by tens of metres where the floor allows, stay on it where
// it does not, and still leave the tile where the valley does.

import { describe, expect, it } from 'bun:test';
import { meander } from './river.ts';

const straight: [number, number][] = [
  [0, 0],
  [2000, 0],
];

describe('meander', () => {
  it('swings a straight run into bends up to ~1.35 × the amplitude off its line', () => {
    const out = meander(straight, { amplitude: () => 50, wavelength: 400, step: 20 });
    const off = out.map((p) => Math.abs(p[1]));
    expect(Math.max(...off)).toBeGreaterThan(40);
    expect(Math.max(...off)).toBeLessThanOrEqual(50 * 1.35 + 1e-9);
  });
  it('stays on the line where the amplitude is 0 (a gorge)', () => {
    const out = meander(straight, {
      amplitude: (x) => (x < 1000 ? 0 : 50),
      wavelength: 400,
      step: 20,
    });
    for (const p of out) if (p[0] < 1000) expect(Math.abs(p[1])).toBeLessThan(1e-9);
  });
  it('keeps both ends where the path leaves the tile', () => {
    const out = meander(straight, { amplitude: () => 50, wavelength: 400, step: 20 });
    expect(out[0]).toEqual([0, 0]);
    const last = out[out.length - 1] ?? [0, 0];
    expect(last[0]).toBeCloseTo(2000, 9);
    expect(last[1]).toBeCloseTo(0, 9);
  });
});
