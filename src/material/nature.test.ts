import { describe, expect, it } from 'bun:test';
import { NATURE_LIBRARY } from './nature.ts';
import { createCanvas } from './paint/canvas.ts';
import { HOUSE_STRIPS } from './paint/default-sheet.ts';
import { sobelNormals } from './paint/normal.ts';
import { cavityOcclusion, packAlbedo } from './paint/orm.ts';
import { paintStrip } from './paint/strip.ts';
import type { StripRecipe } from './paint/types.ts';
import { NATURE_STRIPS, spanOf } from './trim-sheet.ts';

// One metre of each nature strip at the 4096² house density along V (64 px per scaleMetres).
function paint(id: (typeof NATURE_STRIPS)[number]) {
  const r = HOUSE_STRIPS[id] as StripRecipe;
  const w = Math.round((4096 / spanOf(id)) * 1);
  const c = createCanvas(w, 64, 1, r.scaleMetres, true);
  paintStrip(c, r, 99);
  return c;
}

describe('nature library', () => {
  it('fails a flat strip: every nature strip has relief (mean normal tilt ≥ 1°)', () => {
    for (const id of NATURE_STRIPS) {
      const n = sobelNormals(paint(id));
      let s = 0;
      for (let i = 0; i < n.length; i += 4)
        s += Math.hypot(((n[i] ?? 0) - 127.5) / 127.5, ((n[i + 1] ?? 0) - 127.5) / 127.5);
      const deg = (Math.asin(s / (n.length / 4)) * 180) / Math.PI;
      if (deg < 1) throw new Error(`${id} is flat: ${deg.toFixed(2)}°`);
    }
  });

  it('keeps albedo in a plausible sRGB band and roughness varied', () => {
    for (const id of NATURE_STRIPS) {
      const c = paint(id);
      const a = packAlbedo(c, cavityOcclusion(c));
      let sum = 0;
      for (let i = 0; i < a.length; i += 4)
        sum += ((a[i] ?? 0) + (a[i + 1] ?? 0) + (a[i + 2] ?? 0)) / 3;
      const mean = sum / (a.length / 4);
      expect([id, mean > 25 && mean < 245]).toEqual([id, true]);
      const r = [...c.rough];
      expect([id, Math.max(...r) - Math.min(...r) > 0.02]).toEqual([id, true]);
    }
  });

  it('documents every strip with a description and a source', () => {
    for (const id of NATURE_STRIPS) {
      expect(NATURE_LIBRARY[id].description?.length ?? 0).toBeGreaterThan(10);
      expect(NATURE_LIBRARY[id].sources?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
