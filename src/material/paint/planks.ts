// Timber boards (kind 'planks'): boards run along U, butt joints staggered at random, dark gaps,
// stretched grain with growth-ring streaks, occasional knots, per-board tone.
// params: width 0.15 · length 1.0 · gap 0.004 · depth 0.004 · knots 1.5 (per board-metre)

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { Courses } from './courses.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

export function paintPlanks(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const width = param(p, 'width', 0.15);
  const length = param(p, 'length', 1);
  const gap = param(p, 'gap', 0.004);
  const depth = param(p, 'depth', 0.004);
  const knots = param(p, 'knots', 1.5);
  const boards = new Courses(c, { course: width, length, irregular: 0.6, stagger: 0, seed });
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const k = boards.at(ym);
    const dy = Math.min(ym - boards.y0, boards.y1 - ym);
    const vy = (ym - boards.y0) / (boards.y1 - boards.y0);
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const id = boards.id[x] ?? 0;
      const h = hash2(k, id, seed);
      const d = Math.min((boards.dx[x] ?? 0) * 1.5, dy);
      const edge = smooth(gap * 0.5, gap * 1.5, d);
      // Grain: rings warped by a long, thin noise; the board's own seed shifts its figure.
      const warp = noiseAt(c, xm, ym, 0.4, 0.05, seed + id * 31 + k * 7, 3);
      const ring = Math.sin((vy * 9 + warp * 3 + h * 6) * Math.PI * 2);
      const fibre = noiseAt(c, xm, ym, 0.08, 0.002, seed + 17, 2);
      let knot = 0;
      const nk = Math.floor(knots * length * h * 2);
      for (let q = 0; q < nk; q++) {
        const kx = hash2(k * 13 + q, id, seed + 41) * c.metresU;
        const ky =
          boards.y0 + (0.25 + 0.5 * hash2(k, id * 5 + q, seed + 43)) * (boards.y1 - boards.y0);
        let ddx = Math.abs(xm - kx);
        if (c.wrapU) ddx = Math.min(ddx, c.metresU - ddx);
        const rr = Math.sqrt((ddx / 2.2) ** 2 + (ym - ky) ** 2) / (width * 0.12);
        if (rr < 1) knot = Math.max(knot, 1 - rr);
      }
      c.height[i] = -depth * (1 - edge) + 0.0004 * ring * edge + 0.0003 * fibre - 0.0008 * knot;
      c.tone[i] =
        (0.66 + 0.22 * h) *
        (1 + 0.08 * ring + 0.06 * fibre) *
        (1 - 0.5 * knot) *
        (0.5 + 0.5 * edge);
      c.rough[i] = r.roughness + 0.05 * fibre + 0.1 * (1 - edge);
    }
  }
}
