import { describe, expect, it } from 'bun:test';
import { createCanvas } from './canvas.ts';
import { paintPlates } from './plates.ts';

/** Centres (texels) of the circular runs of `row` above `cut`, so a rivet across the wrap is one run. */
function runCentres(row: Float32Array, cut: number): number[] {
  const w = row.length;
  const on = (x: number): boolean => (row[((x % w) + w) % w] ?? 0) > cut;
  let start = 0;
  while (on(start) && start < w) start++;
  const centres: number[] = [];
  for (let x = start; x < start + w; x++) {
    if (!on(x) || on(x - 1)) continue;
    let end = x;
    while (on(end + 1)) end++;
    centres.push(((((x + end) / 2) % w) + w) % w);
  }
  return centres.sort((a, b) => a - b);
}

describe('paintPlates: rivet rows', () => {
  it('space rivets evenly across the U wrap (default pitch 0.09 on the 4 m iron strip)', () => {
    const w = 4096;
    const c = createCanvas(w, 64, 4, 0.5, true);
    paintPlates(c, { kind: 'plates', scaleMetres: 0.5, roughness: 0.55, params: { rust: 0 } }, 7);
    // Row 6 sits `inset` (0.05 m) above the course edge: a horizontal rivet row, no seam rivets.
    const row = c.height.slice(6 * w, 7 * w);
    const sorted = [...row].sort((a, b) => a - b);
    const centres = runCentres(row, (sorted[w >> 1] ?? 0) + 0.002);
    const n = Math.round(4 / 0.09);
    expect(centres.length).toBe(n);
    const spacing = w / n;
    for (let k = 0; k < centres.length; k++) {
      const a = centres[k] ?? 0;
      const b = (centres[(k + 1) % centres.length] ?? 0) + (k + 1 === centres.length ? w : 0);
      expect(Math.abs(b - a - spacing)).toBeLessThan(2);
    }
  });
});
