import { afterEach, describe, expect, it } from 'bun:test';
import { CREATURE_MATERIALS } from './creature.ts';
import { defineMaterial, resetMaterials } from './define.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintKit } from './paint/kit.ts';
import { STRAND_CELLS, STRAND_LAYOUT, strandCells, strandPainter } from './strands.ts';
import { STRIP_H } from './trim-sheet.ts';

afterEach(resetMaterials);

/** Paint one strand row at a 2048² sheet's row size (2048 × 32 px). */
function paintRow(seed = 5) {
  const c = createCanvas(2048, 32, 4, 0.05, true);
  strandPainter(STRAND_LAYOUT.fur_clumps)(c, paintKit(c, seed));
  return c;
}

const alphaAt = (rgba: Uint8Array, w: number, x: number, y: number): number =>
  (rgba[(y * w + x) * 4 + 3] ?? 0) / 255;

describe('strandCells', () => {
  it('fails: the strip must be defined first', () => {
    expect(() => strandCells('fur_clumps', 'fur')).toThrow(/neither built in nor defined/);
  });

  it('fails: a kind the strip does not hold names the ones it does', () => {
    defineMaterial(CREATURE_MATERIALS.fur_clumps);
    expect(() => strandCells('fur_clumps', 'beard')).toThrow(/has no 'beard' cells/);
  });

  it('cells sit inside their row, side by side, root at low U', () => {
    defineMaterial(CREATURE_MATERIALS.hair_clumps);
    const hair = strandCells('hair_clumps', 'hair');
    const beard = strandCells('hair_clumps', 'beard');
    expect(hair.length + beard.length).toBe(STRAND_CELLS);
    for (const r of [...hair, ...beard]) {
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1 - r.v0).toBeLessThan(STRIP_H);
      expect(r.u1 - r.u0).toBeLessThan(1 / STRAND_CELLS);
    }
    const last = hair[hair.length - 1];
    const first = beard[0];
    expect(last && first && last.u1 <= first.u0).toBe(true);
  });
});

describe('strandPainter', () => {
  it('fails: the padded edge rows stay transparent, so no card shows a hard border', () => {
    const c = paintRow();
    const rgba = c.rgba ?? new Uint8Array(0);
    expect(rgba.length).toBe(2048 * 32 * 4);
    for (let x = 0; x < 2048; x += 7) {
      expect(alphaAt(rgba, 2048, x, 0)).toBe(0);
      expect(alphaAt(rgba, 2048, x, 31)).toBe(0);
    }
  });

  it('clumps are opaque at the root and thin out toward the tip', () => {
    const c = paintRow();
    const rgba = c.rgba ?? new Uint8Array(0);
    const cw = 2048 / STRAND_CELLS;
    const cover = (x0: number, x1: number): number => {
      let s = 0;
      let n = 0;
      for (let x = Math.round(x0); x < x1; x++)
        for (let y = 4; y < 28; y++, n++) s += alphaAt(rgba, 2048, x, y) >= 0.5 ? 1 : 0;
      return s / n;
    };
    for (let cell = 0; cell < STRAND_CELLS; cell++) {
      const root = cover(cell * cw + cw * 0.05, cell * cw + cw * 0.2);
      const tip = cover(cell * cw + cw * 0.85, cell * cw + cw * 0.98);
      expect(root).toBeGreaterThan(0.2);
      expect(tip).toBeLessThan(root);
    }
  });

  it('is deterministic per seed and varies with it', () => {
    const a = paintRow(5).rgba ?? new Uint8Array(0);
    const b = paintRow(5).rgba ?? new Uint8Array(0);
    const c = paintRow(6).rgba ?? new Uint8Array(0);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  it('fails if a card is an opaque ribbon: alpha coverage ≤ 55 % in every cell, gaps between strands', () => {
    for (const id of ['fur_clumps', 'hair_clumps'] as const) {
      const c = createCanvas(4096, 64, 4, 0.05, true);
      strandPainter(STRAND_LAYOUT[id])(c, paintKit(c, 9));
      const rgba = c.rgba ?? new Uint8Array(0);
      for (let cell = 0; cell < STRAND_CELLS; cell++) {
        let n = 0;
        let t = 0;
        for (let y = 9; y < 55; y++)
          for (let x = cell * 512 + 10; x < cell * 512 + 502; x++, t++)
            n += alphaAt(rgba, 4096, x, y) >= 0.5 ? 1 : 0;
        expect(n / t).toBeLessThanOrEqual(0.55);
        expect(n / t).toBeGreaterThan(0.2);
      }
    }
  });

  it('tips taper to nothing and guard hair is agouti-banded (pale band, dark tip)', () => {
    const c = createCanvas(4096, 64, 4, 0.05, true);
    strandPainter(STRAND_LAYOUT.fur_clumps)(c, paintKit(c, 9));
    const rgba = c.rgba ?? new Uint8Array(0);
    /** Mean grey and coverage over a U slice [a, b) of a cell (shares of the cell). */
    const slice = (cell: number, a: number, b: number): { grey: number; cover: number } => {
      let g = 0;
      let n = 0;
      let t = 0;
      for (let y = 9; y < 55; y++)
        for (let x = Math.round(cell * 512 + a * 512); x < cell * 512 + b * 512; x++, t++)
          if (alphaAt(rgba, 4096, x, y) >= 0.5) {
            g += rgba[(y * 4096 + x) * 4] ?? 0;
            n++;
          }
      return { grey: n > 0 ? g / n : 0, cover: n / t };
    };
    const guard = STRAND_LAYOUT.fur_clumps.indexOf('guard');
    expect(slice(guard, 0.97, 0.98).cover).toBeLessThan(0.05);
    expect(slice(guard, 0.38, 0.48).grey).toBeGreaterThan(slice(guard, 0.75, 0.9).grey + 40);
  });
});
