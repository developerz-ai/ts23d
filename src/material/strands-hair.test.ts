// Head-hair strand cells at the 2048² preview size (32 px rows, 23 texels across a card): the
// strands stay apart from root to tip, so a card reads as hair, not as a ribbon (D544); the fur
// cells are untouched by that.

import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { materialSnapshot, resetMaterials } from './define.ts';
import { createCanvas } from './paint/canvas.ts';
import { paintKit } from './paint/kit.ts';
import { STRAND_LAYOUT, strandPainter } from './strands.ts';

// Put back, last of all hooks, what other test files' recipes defined at import (D334).
const restoreMaterials = materialSnapshot();
resetMaterials();
afterEach(resetMaterials);
afterAll(restoreMaterials);

const alphaAt = (rgba: Uint8Array, w: number, x: number, y: number): number =>
  (rgba[(y * w + x) * 4 + 3] ?? 0) / 255;

describe('head-hair strand cells', () => {
  // D544: 16–20 strands across a band of 23 texels (a 2048² sheet's row) filled the root half
  // of every head-hair cell solid, so a card read as a 2 mm ribbon with a combed end.
  it('fails if a head-hair cell is solid at the root: strands stay apart from root to tip', () => {
    for (const [id, kind] of [
      ['hair_clumps', 'hair'],
      ['hair_locks', 'lock'],
    ] as const) {
      const c = createCanvas(2048, 32, 4, 0.05, true);
      strandPainter(STRAND_LAYOUT[id])(c, paintKit(c, 9));
      const rgba = c.rgba ?? new Uint8Array(0);
      STRAND_LAYOUT[id].forEach((k, cell) => {
        if (k !== kind) return;
        // The root third of the cell: the share of the band the alpha test keeps, and the
        // strands a column crosses (runs of kept texels).
        let kept = 0;
        let total = 0;
        let runs = 0;
        let cols = 0;
        for (let x = cell * 256 + 26; x < cell * 256 + 90; x++, cols++) {
          let on = false;
          for (let y = 5; y < 27; y++, total++) {
            const a = alphaAt(rgba, 2048, x, y) >= 0.5;
            if (a) kept++;
            if (a && !on) runs++;
            on = a;
          }
        }
        expect(kept / total).toBeLessThan(0.7);
        expect(kept / total).toBeGreaterThan(0.3);
        expect(runs / cols).toBeGreaterThan(4);
      });
    }
  });

  it('fails if the fur cells change with the head-hair ones (D544 left fur as it was)', () => {
    const c = createCanvas(2048, 32, 4, 0.05, true);
    strandPainter(STRAND_LAYOUT.fur_clumps)(c, paintKit(c, 9));
    const fur = c.rgba ?? new Uint8Array(0);
    expect(new Bun.CryptoHasher('sha256').update(fur).digest('hex').slice(0, 16)).toBe(
      '3384b8f26cacae35',
    );
  });
});
