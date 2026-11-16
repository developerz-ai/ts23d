import { describe, expect, it } from 'bun:test';
import { conceptPanels, refFromConcept } from './ref-from-concept.ts';
import { checkRefFile } from './ref-gate.ts';

/** 300×100 white turnaround: a narrow front (tall box), a long side (wide box), a back. */
function turnaround(): Uint8Array {
  const w = 300;
  const h = 100;
  const px = new Uint8Array(w * h * 4).fill(255);
  const fill = (x0: number, x1: number, y0: number, y1: number): void => {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) px.set([80, 70, 60, 255], (y * w + x) * 4);
  };
  fill(30, 60, 20, 90);
  fill(110, 200, 30, 90);
  fill(240, 270, 20, 90);
  return px;
}
const source = { url: 'neural:abc', sha256: 'a'.repeat(64), licence: 'Apache-2.0' };

describe('refFromConcept', () => {
  it('finds the three panels left to right, segmented', () => {
    const p = conceptPanels(turnaround(), 300, 100);
    expect(p.map((x) => [x.x0, x.x1])).toEqual([
      [30, 59],
      [110, 199],
      [240, 269],
    ]);
    expect(p[1]?.rgba[3]).toBe(0);
  });

  it('writes a valid ref.json: front and side differ in shape', () => {
    const ref = checkRefFile(refFromConcept(turnaround(), 300, 100, source));
    expect(Object.keys(ref.views).sort()).toEqual(['front', 'side']);
    expect(ref.views.front?.mask).not.toBe(ref.views.side?.mask);
    expect(ref.views.side?.camera).toBe(null);
  });

  it('refuses an image with one object (not a turnaround)', () => {
    const one = new Uint8Array(300 * 100 * 4).fill(255);
    for (let y = 20; y < 80; y++)
      for (let x = 100; x < 200; x++) one.set([0, 0, 0, 255], (y * 300 + x) * 4);
    expect(() => refFromConcept(one, 300, 100, source)).toThrow('T3D_NEURAL_OUTPUT_INVALID');
  });
});
