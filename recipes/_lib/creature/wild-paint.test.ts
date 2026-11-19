// wild-paint.ts: a scar tapers to nothing at its ends (failure first: at an end the taper is 0,
// so `smooth(0, 0, d)` gave NaN on the end point and full scar colour in a disc around it).

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '@developerz.ai/ts23d';
import { wearPaint } from './wild-paint.ts';

const BASE: Vec3 = [0.5, 0.4, 0.3];
const UP: Vec3 = [0, 0, 1];
const paint = wearPaint({ scars: [{ a: [0, 0, 1], b: [0.2, 0, 1], width: 0.01 }] });

describe('wearPaint scars', () => {
  it('paints a finite colour on the scar end points', () => {
    for (const p of [
      [0, 0, 1],
      [0.2, 0, 1],
    ] as Vec3[]) {
      for (const c of paint(p, UP, BASE)) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('leaves the coat untouched just past either end', () => {
    expect(paint([-0.005, 0, 1], UP, BASE)).toEqual(BASE);
    expect(paint([0.205, 0, 1], UP, BASE)).toEqual(BASE);
  });

  it('still marks the middle of the scar', () => {
    const mid = paint([0.1, 0, 1], UP, BASE);
    expect(Math.abs(mid[0] - BASE[0])).toBeGreaterThan(0.05);
  });
});
