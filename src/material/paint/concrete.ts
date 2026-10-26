// Cast concrete (kind 'concrete'): mottled cement tone, air-void pores, pour-lift lines and
// formwork tie holes on a grid.
// params: pores 0.35 (fraction of 8 mm cells holding a void) · ties 0.6 (tie grid, m; 0 = none)
//         lift 0.6 (pour lift spacing, m; 0 = none) · mottle 0.1

import { type Canvas, noiseAt, param, periodFor, smooth } from './canvas.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

const PORE_CELL = 0.008;

export function paintConcrete(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const pores = param(p, 'pores', 0.35);
  const ties = param(p, 'ties', 0.6);
  const lift = param(p, 'lift', 0.6);
  const mottle = param(p, 'mottle', 0.1);
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const cellM = Math.max(PORE_CELL, 2.5 * Math.max(pu, pv));
  const pPer = periodFor(c, cellM);
  const pCell = c.wrapU ? c.metresU / pPer : cellM;
  const tPer = ties > 0 ? periodFor(c, ties) : 1;
  const tCell = c.wrapU ? c.metresU / tPer : ties;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const liftD = lift > 0 ? Math.abs(ym - Math.round(ym / lift) * lift) : 1;
    const liftGroove = 1 - smooth(0, 0.003, liftD);
    const liftBand = lift > 0 ? hash2(Math.floor(ym / lift), 0, seed + 4) - 0.5 : 0;
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const big = noiseAt(c, xm, ym, 0.25, 0.25, seed, 4);
      const fine = noiseAt(c, xm, ym, 0.004, 0.004, seed + 2, 2);
      const ix = Math.floor(xm / pCell) % pPer;
      const iy = Math.floor(ym / pCell);
      let pit = 0;
      if (hash2(ix, iy, seed + 5) < pores) {
        const cx = (ix + 0.2 + 0.6 * hash2(ix, iy, seed + 6)) * pCell;
        const cy = (iy + 0.2 + 0.6 * hash2(ix, iy, seed + 7)) * pCell;
        const rad = pCell * (0.12 + 0.25 * hash2(ix, iy, seed + 8));
        const d = Math.hypot(xm - cx, ym - cy);
        pit = d < rad ? 1 - d / rad : 0;
      }
      let tie = 0;
      if (ties > 0) {
        const tx = xm - (Math.floor(xm / tCell) + 0.5) * tCell;
        const ty = ym - (Math.floor(ym / ties) + 0.5) * ties;
        const d = Math.hypot(tx, ty);
        tie = d < 0.012 ? 1 : 0;
      }
      c.height[i] =
        0.0005 * big + 0.00015 * fine - 0.0015 * pit - 0.006 * tie - 0.0012 * liftGroove;
      c.tone[i] =
        (0.78 + mottle * big + 0.05 * liftBand) *
        (1 + 0.04 * fine) *
        (1 - 0.4 * pit) *
        (1 - 0.5 * tie);
      c.rough[i] = r.roughness + 0.05 * fine + 0.05 * big;
    }
  }
}
