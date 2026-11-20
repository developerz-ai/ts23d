// The soot blankets fade out into the paint: their edge carries the paint's own tone, so the ragged
// boundary is a fade, not a drawn dark contour.
import { describe, expect, test } from 'bun:test';
import { sootTone } from './soot.ts';

const paint: [number, number, number] = [0.42, 0.08, 0.06];

describe('loco_440 soot blanket tone', () => {
  test('the edge is the paint', () => {
    const c = sootTone(paint, 0);
    for (let k = 0; k < 3; k++) expect(c[k]).toBeCloseTo(paint[k] ?? 0, 9);
  });

  test('darkens monotonically to full soot in the middle', () => {
    let last = Number.POSITIVE_INFINITY;
    for (let d = 0; d <= 1.0001; d += 0.05) {
      const v = sootTone(paint, d)[0];
      expect(v).toBeLessThanOrEqual(last);
      last = v;
    }
    expect(sootTone(paint, 1)[0]).toBeLessThan(0.03);
  });
});
