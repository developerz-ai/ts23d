import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { CREATURE_MATERIALS } from './creature.ts';
import { defineMaterial, materialSnapshot, resetMaterials } from './define.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintKit } from './paint/kit.ts';
import { STRAND_CELLS, STRAND_LAYOUT, strandCells, strandPainter } from './strands.ts';
import { STRIP_H } from './trim-sheet.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();

// A row comes from the id alone: start from an empty table, whatever earlier files registered.
resetMaterials();
afterEach(resetMaterials);
afterAll(restoreMaterials);

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
    const wisp = strandCells('hair_clumps', 'wisp');
    const beard = strandCells('hair_clumps', 'beard');
    expect(hair.length + wisp.length + beard.length).toBe(STRAND_CELLS);
    for (const r of [...hair, ...wisp, ...beard]) {
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

  it('fails if a fur or guard clump fills to an opaque lozenge at 2048² (D59): locks with gaps', () => {
    // The 2048² preview sheet: 32-px rows, ~18 px of strands. Too many 1-texel strands merge
    // into one solid shape, and every card reads as a chip.
    const c = paintRow(9);
    const rgba = c.rgba ?? new Uint8Array(0);
    const cw = 2048 / STRAND_CELLS;
    STRAND_LAYOUT.fur_clumps.forEach((_kind, cell) => {
      let fill = 0;
      let runs = 0;
      let cols = 0;
      for (let x = Math.round(cell * cw + cw * 0.4); x < cell * cw + cw * 0.6; x++) {
        let first = -1;
        let last = -1;
        let on = 0;
        let prev = false;
        for (let y = 0; y < 32; y++) {
          const o = alphaAt(rgba, 2048, x, y) >= 0.5;
          if (o) {
            on++;
            if (first < 0) first = y;
            last = y;
            if (!prev) runs++;
          }
          prev = o;
        }
        if (first < 0) continue;
        fill += on / (last - first + 1);
        cols++;
      }
      expect(cols).toBeGreaterThan(0);
      expect(fill / cols).toBeLessThanOrEqual(0.75);
      expect(runs / cols).toBeGreaterThanOrEqual(2);
    });
  });

  it('fails if a transparent texel is lighter than the strands beside it (D460: specks at card edges)', () => {
    // Filtering (our bilinear, any engine's) mixes an edge texel's colour with its transparent
    // neighbour's: a light fill there outlines every dark strand in pale specks.
    for (const id of ['fur_clumps', 'hair_clumps'] as const) {
      const c = createCanvas(2048, 32, 4, 0.05, true);
      strandPainter(STRAND_LAYOUT[id])(c, paintKit(c, 9));
      const rgba = c.rgba ?? new Uint8Array(0);
      let edges = 0;
      for (let y = 1; y < 31; y++)
        for (let x = 1; x < 2047; x++) {
          if (alphaAt(rgba, 2048, x, y) > 0) continue;
          let hi = -1;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const)
            if (alphaAt(rgba, 2048, x + dx, y + dy) > 0)
              hi = Math.max(hi, rgba[((y + dy) * 2048 + x + dx) * 4] ?? 0);
          if (hi < 0) continue;
          edges++;
          expect(rgba[(y * 2048 + x) * 4] ?? 0).toBeLessThanOrEqual(hi + 24);
        }
      expect(edges).toBeGreaterThan(100);
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
    for (const id of ['fur_clumps', 'hair_clumps', 'hair_locks'] as const) {
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
        // Wisps are a few stray strands by design; every other clump still hides what it covers.
        const sparse = STRAND_LAYOUT[id][cell] === 'wisp' || STRAND_LAYOUT[id][cell] === 'fly';
        expect(n / t).toBeGreaterThan(sparse ? 0.03 : 0.2);
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

  it('fails if hair locks stop short or end square: tips fill the last fifth, sparser than the middle', () => {
    // At the 2048² preview size (32 px rows), where a blunt clump reads as a paper strip.
    const c = createCanvas(2048, 32, 4, 0.05, true);
    strandPainter(STRAND_LAYOUT.hair_clumps)(c, paintKit(c, 9));
    const rgba = c.rgba ?? new Uint8Array(0);
    const cover = (cell: number, a: number, b: number): number => {
      let n = 0;
      let t = 0;
      for (let y = 5; y < 27; y++)
        for (let x = Math.round(cell * 256 + a * 256); x < cell * 256 + b * 256; x++, t++)
          n += alphaAt(rgba, 2048, x, y) >= 0.5 ? 1 : 0;
      return n / t;
    };
    STRAND_LAYOUT.hair_clumps.forEach((kind, cell) => {
      if (kind !== 'hair') return;
      const tips = cover(cell, 0.8, 0.9);
      expect(tips).toBeGreaterThan(0.05);
      expect(tips).toBeLessThan(cover(cell, 0.3, 0.4) * 0.6);
    });
  });

  it('fails if a lock-style lock is not dark at the root and light by the tip (D461)', () => {
    const c = createCanvas(2048, 32, 4, 0.05, true);
    strandPainter(STRAND_LAYOUT.hair_locks)(c, paintKit(c, 9));
    const rgba = c.rgba ?? new Uint8Array(0);
    const grey = (cell: number, a: number, b: number): number => {
      let g = 0;
      let n = 0;
      for (let y = 4; y < 28; y++)
        for (let x = Math.round(cell * 256 + a * 256); x < cell * 256 + b * 256; x++)
          if (alphaAt(rgba, 2048, x, y) >= 0.5) {
            g += rgba[(y * 2048 + x) * 4] ?? 0;
            n++;
          }
      return n > 0 ? g / n : 0;
    };
    STRAND_LAYOUT.hair_locks.forEach((kind, cell) => {
      if (kind !== 'lock') return;
      expect(grey(cell, 0.6, 0.8)).toBeGreaterThan(grey(cell, 0.03, 0.12) + 30);
    });
    // The under-layer mass stays darker than the locks over it.
    const mass = STRAND_LAYOUT.hair_locks.indexOf('mass');
    const lock = STRAND_LAYOUT.hair_locks.indexOf('lock');
    expect(grey(mass, 0.3, 0.8)).toBeLessThan(grey(lock, 0.3, 0.8));
  });

  // D525: head hair at the coat's 0.5 roughness had no sheen band in the path-traced hero (the
  // strand lobes widen with roughness) and its locks streaked 0.65–1.35 strand to strand: straw.
  it('fails if head-hair cells are as rough as fur, or fur cells changed roughness', () => {
    const rough = (id: 'fur_clumps' | 'hair_clumps' | 'hair_locks'): number[] => {
      const c = createCanvas(2048, 32, 4, 0.05, true);
      strandPainter(STRAND_LAYOUT[id])(c, paintKit(c, 9));
      return STRAND_LAYOUT[id].map((_, cell) => c.rough[16 * 2048 + cell * 256 + 128] ?? 0);
    };
    for (const r of rough('fur_clumps')) expect(r).toBe(0.5);
    for (const id of ['hair_clumps', 'hair_locks'] as const)
      rough(id).forEach((r, cell) => {
        const kind = STRAND_LAYOUT[id][cell];
        expect(r).toBeLessThan(kind === 'beard' || kind === 'coarse' ? 0.51 : 0.45);
      });
  });

  it('fails if neighbouring strands of a lock differ by more than a fifth in value (straw)', () => {
    const c = createCanvas(4096, 64, 4, 0.05, true);
    strandPainter(STRAND_LAYOUT.hair_locks)(c, paintKit(c, 9));
    const rgba = c.rgba ?? new Uint8Array(0);
    const lock = STRAND_LAYOUT.hair_locks.indexOf('lock');
    // Down one column across the band mid-lock: the grey of the texels that pass the alpha cut
    // (a fine strand's core is under two texels wide), spread as max / min.
    const x = lock * 512 + 256;
    const greys: number[] = [];
    for (let y = 9; y < 55; y++)
      if (alphaAt(rgba, 4096, x, y) >= 0.5) greys.push(rgba[(y * 4096 + x) * 4] ?? 0);
    expect(greys.length).toBeGreaterThan(4);
    // sRGB-encoded grey: a 1.2× linear spread is ~1.09× encoded.
    expect(Math.max(...greys) / Math.min(...greys)).toBeLessThan(1.2);
  });
});
