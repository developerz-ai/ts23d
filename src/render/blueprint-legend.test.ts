// The blueprint legend: a tolerance is printed as it is (0.5 % is not '1%'), and the strip is as
// tall as the joint rows it draws, however many joints wrap.

import { describe, expect, it } from 'bun:test';
import { jointRows, legend, legendHeight, tolText } from './blueprint-legend.ts';
import type { MeasureResult } from './blueprint-measures.ts';
import { OK } from './blueprint-measures.ts';
import type { JointMark } from './blueprint-panel.ts';

const WIDTH = 1600;
const measure = (tolerance: number): MeasureResult => ({
  measure: { label: 'gauge', value: 1.435, axis: 'y', parts: ['rail'], tolerance },
  value: 1.437,
  missing: [],
  ok: true,
  a: [0, 0, 0],
  b: [0, 0, 0],
  box: { min: [0, 0, 0], max: [0, 0, 0] },
});
const joints = (n: number, stem = 'hip_joint'): JointMark[] =>
  Array.from({ length: n }, (_, i) => ({
    name: `${stem}_${String(i).padStart(2, '0')}`,
    at: [0, 0, 0],
    rgb: OK,
  }));
/** The legend drawn on a white canvas `height` px tall: inked pixel count and the last inked row. */
const draw = (ms: readonly MeasureResult[], js: readonly JointMark[], height: number) => {
  const px = new Uint8Array(WIDTH * height * 4).fill(255);
  legend({ px, width: WIDTH, height }, 0, ms, js);
  let ink = 0;
  let last = -1;
  for (let i = 0; i < px.length; i += 4)
    if (px[i] !== 255 || px[i + 1] !== 255 || px[i + 2] !== 255) {
      ink++;
      last = Math.floor(i / 4 / WIDTH);
    }
  return { ink, last, px };
};
const names = (js: readonly JointMark[]): string[] => js.map((j) => j.name);

describe('blueprint legend', () => {
  it('reserves a row for every joint row it draws: 40 joints lose nothing off the canvas', () => {
    const js = joints(40);
    const rows = jointRows(names(js), WIDTH).rows;
    expect(rows).toBeGreaterThan(2);
    const h = legendHeight(1, names(js), WIDTH);
    const fitted = draw([measure(0.02)], js, h);
    const roomy = draw([measure(0.02)], js, h + 400);
    expect(fitted.ink).toBe(roomy.ink);
    expect(roomy.last).toBeLessThan(h);
    // Two rows fewer in the canvas and the last joints are cut: the height is not padded either.
    expect(draw([measure(0.02)], js, h - 32).ink).toBeLessThan(roomy.ink);
  });

  it('keeps the two-row strip of a short joint list', () => {
    expect(legendHeight(1, names(joints(3)), WIDTH)).toBe(18 + 4 * 16 + 10);
    expect(legendHeight(1, [], WIDTH)).toBe(18 + 2 * 16 + 10);
  });

  it('starts a new row for a name that would cross the right edge', () => {
    const js = joints(30, 'a_very_long_joint_name_for_a_legend');
    const { at } = jointRows(names(js), WIDTH);
    at.forEach(([x], i) => {
      expect(x + 16 + (js[i]?.name.length ?? 0) * 8).toBeLessThanOrEqual(WIDTH - 12);
    });
    const h = legendHeight(0, names(js), WIDTH);
    expect(draw([], js, h).ink).toBe(draw([], js, h + 400).ink);
  });

  it('prints a tolerance below 1 % as it is, not rounded to 1% or 0%', () => {
    expect(tolText(0.005)).toBe('0.5');
    expect(tolText(0.0025)).toBe('0.25');
    expect(tolText(0.02)).toBe('2');
    expect(tolText(0.07)).toBe('7');
    expect(tolText(0.015)).toBe('1.5');
    // On the sheet: ±0.5 % and ±1 % are different rows of pixels.
    const half = draw([measure(0.005)], [], 80).px;
    const one = draw([measure(0.01)], [], 80).px;
    expect(Bun.hash(half)).not.toBe(Bun.hash(one));
  });
});
