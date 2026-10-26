// Roof slate (kind 'slate'): overlapping courses — each visible slate rises from where it slides
// under the course above to a thick, chipped lower edge that casts the shadow line — staggered
// vertical gaps, riven (laminar) face, per-slate tone and tilt.
// params: course 0.11 (exposure) · length 0.25 · gap 0.003 · thick 0.007 · variation 0.3

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { Courses } from './courses.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

export function paintSlate(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const course = param(p, 'course', 0.11);
  const gap = param(p, 'gap', 0.003);
  const thick = param(p, 'thick', 0.007);
  const variation = param(p, 'variation', 0.3);
  const rows = new Courses(c, {
    course,
    length: param(p, 'length', 0.25),
    irregular: 0.15,
    stagger: 0.5,
    seed,
  });
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const k = rows.at(ym);
    const span = rows.y1 - rows.y0;
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const id = rows.id[x] ?? 0;
      const h = hash2(k, id, seed);
      const chip = (noiseAt(c, xm, ym, 0.015, 0.01, seed + 5, 3) + 0.3) * span * 0.08;
      const uy = Math.max(0, ym - rows.y0 - Math.max(0, chip));
      const t = uy / span;
      const lam = noiseAt(c, xm, ym, 0.12, 0.004, seed + 9, 3);
      const fine = noiseAt(c, xm, ym, 0.005, 0.005, seed + 13, 2);
      const sideGap = smooth(gap * 0.5, gap * 1.2, rows.dx[x] ?? 0);
      const bevel = smooth(0, 0.004, uy);
      const tilt = (hash2(id, k, seed + 1) - 0.5) * 0.002 * ((rows.ux[x] ?? 0) / 0.25);
      c.height[i] =
        (thick * (1 - t) * bevel + 0.0005 * lam + tilt) * sideGap - thick * (1 - sideGap);
      c.tone[i] =
        (0.62 - variation * 0.5 + variation * h) *
        (1 + 0.08 * lam + 0.04 * fine) *
        (0.55 + 0.45 * sideGap);
      c.rough[i] = r.roughness + 0.08 * lam + 0.05 * fine;
    }
  }
}
