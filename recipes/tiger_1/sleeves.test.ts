// Both barrel camouflage sleeves sit on the barrel. Failure first: the olive sleeve was centred at
// x 7.0 m, 1.7 m past the muzzle (x 5.29 m), so the barrel carried one sleeve, not two.
import { describe, expect, it } from 'bun:test';
import { BARREL_SLEEVES, GUN_AT } from './tiger_1.ts';

describe('tiger_1 barrel sleeves', () => {
  it('every sleeve is centred on the barrel, trunnion to muzzle', () => {
    expect(BARREL_SLEEVES.length).toBe(2);
    for (const s of BARREL_SLEEVES) {
      expect(s.c[0]).toBeGreaterThan(GUN_AT[0]);
      expect(s.c[0]).toBeLessThan(GUN_AT[0] + 4.14);
      expect(s.c[2]).toBeCloseTo(GUN_AT[2], 9);
    }
  });
});
