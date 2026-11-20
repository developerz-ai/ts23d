import { describe, expect, it } from 'bun:test';
import { dmath } from '../core/index.ts';
import { clawRoot } from './creature-feet.ts';

describe('clawRoot', () => {
  it('fails before D345: a toe under 3 mm still roots its claw with a positive radius, inside it', () => {
    const semi = [0.002, 0.0015, 0.0012] as const;
    const root = clawRoot([...semi], [0, 0, 0], [0.002, 0, 0], [1, 0, -0.5], 0.004);
    expect(root.radius).toBeGreaterThan(0);
    // The root centre sits within the knuckle's ellipsoid.
    const q = root.base.map((c, i) => c / (semi[i] ?? 1));
    expect(dmath.norm(q)).toBeLessThan(1);
  });

  it('keeps the 3 mm burial and the knuckle-limited radius on a toe that has room', () => {
    const root = clawRoot([0.02, 0.012, 0.015], [0, 0, 0], [0.02, 0, 0], [1, 0, -0.9], 0.05);
    expect(root.radius).toBeCloseTo(0.012 - 0.003, 9);
    expect(root.sunk).toBeGreaterThan(0);
  });
});
