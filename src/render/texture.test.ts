// The trim sheet as the renderers sample it: a strip row (or cell) never reads its neighbours,
// whatever mip the triangle's footprint picks (D600: the faction plaza's 0.5 m concrete bands,
// seen at mip 4 of a 2048² sheet, printed a seam of `glass` / `oak` at every band edge).
import { describe, expect, it } from 'bun:test';
import { type PaintedSheet, STRIP_H, STRIP_ROWS, STRIPS } from '../material/index.ts';
import { SRGB, sample, sheetTextures } from './texture.ts';

const SIZE = 1024;
const CELLS = 16;

/** A sheet whose every strip row and cell is one flat, distinct colour. */
function flatSheet(): PaintedSheet {
  const albedo = new Uint8Array(SIZE * SIZE * 4);
  const rowPx = SIZE * STRIP_H;
  const cellPx = SIZE / CELLS;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const row = Math.floor(y / rowPx);
      if (row < STRIP_ROWS) albedo[i] = 20 + row * 4;
      else {
        const cy = Math.floor((y - STRIP_ROWS * rowPx) / cellPx);
        albedo[i + 1] = 20 + (cy * CELLS + Math.floor(x / cellPx)) * 7;
      }
      albedo[i + 3] = 255;
    }
  return {
    size: SIZE,
    albedo,
    normal: new Uint8Array(SIZE * SIZE * 4).fill(128),
    orm: new Uint8Array(SIZE * SIZE * 4).fill(200),
  };
}

const tex = sheetTextures(flatSheet());
const out = new Float32Array(4);
/** Half a texel of the 4096² house sheet: where `stripV` puts a band's first and last V. */
const EDGE = 0.5 / 4096;

describe('sample (trim sheet)', () => {
  const row = STRIPS.indexOf('concrete');
  const want = SRGB[20 + row * 4] ?? 0;

  it('fixture: concrete sits between glass and oak', () => {
    expect([STRIPS[row - 1], STRIPS[row + 1]]).toEqual(['glass', 'oak']);
  });

  for (let level = 0; level < tex.albedo.length; level++)
    it(`a concrete band's edges read concrete only at mip ${level}`, () => {
      for (const v of [row * STRIP_H + EDGE, (row + 1) * STRIP_H - EDGE, (row + 0.5) * STRIP_H])
        for (const u of [0, 0.37, 0.999, 3.5]) {
          sample(tex.albedo, level, u, v, out);
          expect(out[0]).toBeCloseTo(want, 6);
          expect(out[1]).toBeCloseTo(0, 6);
        }
    });

  it('a cell reads only itself at its four edges, at every mip', () => {
    const cellPx = 1 / CELLS;
    const cy = 1;
    const cx = 5;
    const want = SRGB[20 + (cy * CELLS + cx) * 7] ?? 0;
    const v0 = STRIP_ROWS * STRIP_H + cy * cellPx;
    const u0 = cx * cellPx;
    for (let level = 0; level < tex.albedo.length; level++)
      for (const [u, v] of [
        [u0 + EDGE, v0 + EDGE],
        [u0 + cellPx - EDGE, v0 + cellPx - EDGE],
        [u0 + EDGE + 2, v0 + cellPx / 2],
      ] as const) {
        sample(tex.albedo, level, u, v, out);
        expect(out[0]).toBeCloseTo(0, 6);
        expect(out[1]).toBeCloseTo(want, 6);
      }
  });

  it('V below and above the sheet clamps to the first strip row and the top cell row', () => {
    sample(tex.albedo, 0, 0.5, -0.2, out);
    expect(out[0]).toBeCloseTo(SRGB[20] ?? 0, 6);
    sample(tex.albedo, 0, 0.01, 1.3, out);
    expect(out[1]).toBeCloseTo(SRGB[20 + CELLS * 7] ?? 0, 6);
  });
});
