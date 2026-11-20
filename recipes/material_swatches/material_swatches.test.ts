// The front row's labels are as large as the rows behind. Failure first: its plinth face was
// 0.45 m, so the 60 %-of-face cap clamped a 4 m panel's label to 0.27 m against 0.32 m behind.
import { describe, expect, it } from 'bun:test';
import { capOf, row } from './material_swatches.ts';

describe('material_swatches labels', () => {
  // The front row holds the classic strips, every one a 4 m repeat (`ROWS` packs ≤ 34 m rows).
  for (const w of [1, 2, 4])
    it(`a ${w} m panel's label is the same size in the front row as behind it`, () => {
      expect(capOf(w, row(0).top)).toBe(capOf(w, row(1).top));
    });
  it('a 4 m panel gets 0.32 m letters', () => {
    expect(capOf(4, row(0).top)).toBeCloseTo(0.32, 9);
  });
});
