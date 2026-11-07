// Timber boards (kind 'planks'): boards run along U, butt joints staggered at random, dark gaps,
// stretched grain with growth-ring streaks, occasional knots, per-board tone. Species and finish
// come from params on top: `rings` blends latewood to albedo2, `rays` adds oak's ray flecks,
// `checks` weathers (eroded soft grain, splits along it, silvering), `paint` lays a film over the
// grain whose `chips` reveal bare wood (albedo2), mostly along board edges.
// params: width 0.15 · length 1.0 · gap 0.004 · depth 0.004 · knots 1.5 (per board-metre)
//         rings 0 · rays 0 · checks 0 · paint 0 · paintRough 0.5 · chips 0.3

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
  const rings = param(p, 'rings', 0);
  const rays = param(p, 'rays', 0);
  const checks = param(p, 'checks', 0);
  const paint = param(p, 'paint', 0);
  const paintRough = param(p, 'paintRough', 0.5);
  const chips = param(p, 'chips', 0.3);
  const boards = new Courses(c, { course: width, length, irregular: 0.6, stagger: 0, seed });
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const ringsN = Math.max(1, Math.min(9, Math.floor(width / pv / 4)));
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
      let height = -depth * (1 - edge) + 0.0004 * ring * edge + 0.0003 * fibre - 0.0008 * knot;
      let tone =
        (0.66 + 0.22 * h) *
        (1 + 0.08 * ring + 0.06 * fibre) *
        (1 - 0.5 * knot) *
        (0.5 + 0.5 * edge);
      let rough = r.roughness + 0.05 * fibre + 0.1 * (1 - edge);
      // Colour rings at a frequency the strip's V texels can hold (≥ ~4 texels per ring).
      const ring2 = Math.sin((vy * ringsN + warp * 2.5 + h * 6) * Math.PI * 2);
      const late = smooth(0.1, 0.8, ring2) * (0.75 + 0.25 * fibre);
      let mix = rings * Math.max(late, knot);
      if (rays > 0) {
        const fleck = smooth(0.55, 0.8, noiseAt(c, xm, ym, 0.03, 0.004, seed + 23, 2));
        tone *= 1 + 0.25 * rays * fleck;
        mix *= 1 - rays * fleck;
      }
      if (checks > 0) {
        // Soft earlywood erodes, leaving latewood ridges; splits open along the grain.
        const split = smooth(0.45, 0.6, noiseAt(c, xm, ym, 0.3, 0.003, seed + 29 + id, 3));
        height += checks * (0.0006 * late - 0.002 * split);
        tone *= 1 - checks * (0.45 * split + 0.08 * (1 - late));
        rough += checks * 0.1 * (1 - late);
        mix = Math.max(mix, checks * split);
      }
      if (paint > 0) {
        // Paint fails first at board edges and ends, then in blotches across the face.
        const n = noiseAt(c, xm, ym, 0.04, 0.03, seed + 31, 4) * 0.5 + 0.5;
        const nearEdge = 1 - smooth(gap, gap * 6, d);
        const chip = smooth(0.5, 0.56, n + chips * 0.5 + nearEdge * 0.15 - 0.45);
        const film = paint * (1 - chip);
        height = height * (1 - 0.4 * film) - chip * paint * 0.0002;
        // The film follows the grain: board tone and rings still read through it, faintly.
        const under = (0.9 + 0.06 * h) * (1 + 0.05 * ring + 0.04 * fibre) * (0.55 + 0.45 * edge);
        tone = tone * (1 - film) + under * film;
        rough = rough * (1 - film) + (paintRough + 0.04 * fibre) * film;
        mix = mix * (1 - film) + paint * chip;
      }
      c.height[i] = height;
      c.tone[i] = tone;
      c.rough[i] = Math.min(1, rough);
      c.mix[i] = mix;
    }
  }
}
