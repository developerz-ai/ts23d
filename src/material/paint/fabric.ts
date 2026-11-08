// Soft goods. 'weave': canvas / duck cloth — an over-under thread lattice (warp along U, weft
// along V, never finer than the texel), slubbed threads, soft folds and water stains toward the
// bottom. 'leather': pebbled grain, creases running across the hide and burnished wear where it
// is handled (smoother, a little lighter, darker in the creases). `relief` (0..1) rebuilds the
// height so the normal map carries it: weave ribs one pitch wide along U (V texels are too coarse
// for weft, so each row shifts a quarter pitch: a twill that survives the Sobel), and leather
// pebbles as cellular domes with dark crevices between them.
// params (weave): pitch 0.004 · folds 0.6 · stains 0.3 · relief 0
// params (leather): pebble 0.004 · creases 0.5 · wear 0.4 · relief 0

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { type Cell, worley } from './relief.ts';
import type { StripRecipe } from './types.ts';

export function paintWeave(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  // Threads below ~2 texels alias into moiré: keep the lattice resolvable on both axes.
  const pitchU = Math.max(param(p, 'pitch', 0.004), 2 * pu);
  const pitchV = Math.max(param(p, 'pitch', 0.004), 2 * pv);
  const folds = param(p, 'folds', 0.6);
  const stains = param(p, 'stains', 0.3);
  const rel = param(p, 'relief', 0);
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const wy = Math.sin((ym / pitchV) * Math.PI * 2);
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const wx = Math.sin((xm / pitchU) * Math.PI * 2);
      const over = Math.floor(xm / pitchU) + Math.floor(ym / pitchV);
      const thread =
        rel > 0
          ? Math.abs(Math.sin((xm / pitchU + 0.25 * y) * Math.PI))
          : over % 2 === 0
            ? Math.abs(wy)
            : Math.abs(wx);
      const slub = noiseAt(c, xm, ym, 0.05, 0.01, seed, 2);
      const fold = noiseAt(c, xm, ym, 0.5, 0.35, seed + 1, 3);
      const stain = stains * smooth(0.1, 0.6, noiseAt(c, xm, ym, 0.2, 0.15, seed + 2, 4));
      c.height[i] = (0.0002 + 0.0002 * rel) * thread + 0.003 * folds * fold + rel * 0.0001 * slub;
      c.tone[i] = (0.9 + 0.06 * thread + 0.05 * slub) * (1 - 0.25 * stain);
      c.rough[i] = Math.min(1, r.roughness + 0.04 * slub - 0.03 * thread);
      c.metal[i] = 0;
      c.mix[i] = stain;
    }
  }
}

export function paintLeather(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const pebble = param(p, 'pebble', 0.004);
  const creases = param(p, 'creases', 0.5);
  const wear = param(p, 'wear', 0.4);
  const rel = param(p, 'relief', 0);
  const cell: Cell = { f1: 0, f2: 0, id: 0 };
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const grain = noiseAt(c, xm, ym, pebble, pebble, seed, 3);
      const crease = smooth(0.4, 0.6, noiseAt(c, xm, ym, 0.12, 0.012, seed + 1, 3)) * creases;
      const rub = wear * smooth(0, 0.6, noiseAt(c, xm, ym, 0.3, 0.3, seed + 2, 4));
      let h = 0.00025 * grain - 0.0008 * crease;
      let pores = 0;
      if (rel > 0) {
        // Pebbles: domes on a cellular grid, crevices between; rubbed tops flatten.
        worley(c, xm, ym, pebble, seed + 3, cell);
        const dome = 1 - Math.min(1, cell.f1 * cell.f1);
        pores = 1 - smooth(0.08, 0.35, cell.f2 - cell.f1);
        h += rel * (0.0006 * dome * (1 - 0.5 * rub) - 0.0005 * pores);
      }
      c.height[i] = h;
      c.tone[i] =
        (0.95 + 0.05 * grain) * (1 - 0.45 * crease) * (1 + 0.12 * rub) * (1 - 0.15 * rel * pores);
      c.rough[i] = Math.min(1, Math.max(0, r.roughness + 0.06 * grain - 0.2 * rub + 0.1 * crease));
      c.metal[i] = 0;
      c.mix[i] = crease;
    }
  }
}
