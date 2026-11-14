import { describe, expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { grime } from './grime.ts';

const crate = box({ size: [1, 1, 1], color: [0.8, 0.8, 0.8] });

describe('grime', () => {
  it('rejects strengths outside 0..1 (zone 2 → negative colour, ground −5 → 3.0)', () => {
    expect(() => grime(crate, { zones: [{ at: [0, 0, 0], radius: 1, strength: 2 }] })).toThrow(
      'T3D_RECIPE_INVALID',
    );
    expect(() => grime(crate, { ground: 1, groundStrength: -5 })).toThrow('T3D_RECIPE_INVALID');
    expect(() => grime(crate, { ground: Number.NaN })).toThrow('T3D_RECIPE_INVALID');
    expect(() => grime(crate, { zones: [{ at: [0, 0, 0], radius: 0, strength: 0.5 }] })).toThrow(
      'T3D_RECIPE_INVALID',
    );
  });

  it('darkens toward the ground and in zones, colours stay in [0, 1]', () => {
    const g = grime(crate, {
      ground: 1,
      groundStrength: 1,
      zones: [{ at: [0, 0, 0], radius: 2, strength: 1 }],
    });
    expect(Math.min(...g.colors)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...g.colors)).toBeLessThanOrEqual(0.8);
    expect(Math.min(...g.colors)).toBeLessThan(0.1);
  });
});
