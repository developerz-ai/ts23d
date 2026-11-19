// The bitmap font: text stays inside its canvas (clipped per pixel, both axes) and a title can be
// shrunk to fit a width.

import { describe, expect, it } from 'bun:test';
import { drawText, fitScale, textWidth } from './font.ts';

const INK = [9, 9, 9] as const;
const canvas = (w: number, h: number) => ({ px: new Uint8Array(w * h * 4), w, h });
/** Inked pixels as 'x,y'. */
const inked = (c: { px: Uint8Array; w: number }): string[] => {
  const out: string[] = [];
  for (let i = 0; i < c.px.length; i += 4)
    if (c.px[i + 3] === 255) out.push(`${(i / 4) % c.w},${Math.floor(i / 4 / c.w)}`);
  return out;
};

describe('drawText clipping', () => {
  it('drops pixels past the right edge instead of wrapping them onto the next row', () => {
    const c = canvas(20, 12);
    // 'HHHHHHHH' at scale 1 is 31 px wide from x = 4: columns 20…34 are off the canvas.
    drawText(c.px, c.w, 4, 2, 'HHHHHHHH', 1, INK);
    const xs = inked(c).map((p) => Number(p.split(',')[0]));
    expect(xs.length).toBeGreaterThan(0);
    // A wrapped pixel lands at x < 4, left of where the text starts.
    expect(Math.min(...xs)).toBe(4);
    // And the visible part is exactly what a wide canvas shows in the same columns.
    const wide = canvas(60, 12);
    drawText(wide.px, wide.w, 4, 2, 'HHHHHHHH', 1, INK);
    expect(inked(c)).toEqual(inked(wide).filter((p) => Number(p.split(',')[0]) < 20));
  });

  it('drops pixels left of, above and below the canvas', () => {
    const c = canvas(16, 8);
    drawText(c.px, c.w, -5, -3, 'HH', 2, INK);
    drawText(c.px, c.w, 2, 5, 'HH', 2, INK);
    const wide = canvas(16, 40);
    drawText(wide.px, wide.w, -5, -3 + 16, 'HH', 2, INK);
    drawText(wide.px, wide.w, 2, 5 + 16, 'HH', 2, INK);
    const expected = inked(wide)
      .map((p) => p.split(',').map(Number))
      .filter(([, y]) => (y ?? 0) >= 16 && (y ?? 0) < 24)
      .map(([x, y]) => `${x},${(y ?? 0) - 16}`);
    expect(inked(c)).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('draws text that fits exactly as before', () => {
    const c = canvas(8, 6);
    drawText(c.px, c.w, 1, 0, 'L', 1, INK);
    expect(inked(c)).toEqual(['1,0', '1,1', '1,2', '1,3', '1,4', '2,4', '3,4']);
  });
});

describe('fitScale', () => {
  it('shrinks a scale until the text fits, and never below 1', () => {
    const text = 'X'.repeat(50);
    expect(textWidth(text, 4)).toBe(796);
    expect(fitScale(text, 4, 795)).toBe(3);
    expect(fitScale(text, 4, 796)).toBe(4);
    expect(fitScale(text, 4, 250)).toBe(1);
    expect(fitScale(text, 4, 10)).toBe(1);
  });
});
