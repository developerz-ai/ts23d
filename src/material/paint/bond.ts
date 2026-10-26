// Brick and stone bond (kind 'bond'): staggered courses, recessed mortar with chipped edges,
// per-unit tone and tilt, face pitting. Stone is the same bond with `irregular` > 0 and bigger,
// rougher units.
// params: course 0.075 · length 0.225 · mortar 0.01 · depth 0.006 · bevel 0.004 · irregular 0
//         stagger 0.5 · relief 0.0008 (face roughness amplitude, m) · variation 0.3 (tone spread)

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { Courses } from './courses.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

export function paintBond(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const mortar = param(p, 'mortar', 0.01);
  const depth = param(p, 'depth', 0.006);
  const bevel = param(p, 'bevel', 0.004);
  const relief = param(p, 'relief', 0.0008);
  const variation = param(p, 'variation', 0.3);
  const course = param(p, 'course', 0.075);
  const length = param(p, 'length', 0.225);
  const courses = new Courses(c, {
    course,
    length,
    irregular: param(p, 'irregular', 0),
    stagger: param(p, 'stagger', 0.5),
    seed,
  });
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const half = mortar / 2;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const k = courses.at(ym);
    const dy = Math.min(ym - courses.y0, courses.y1 - ym);
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const unit = courses.id[x] ?? 0;
      const chip = noiseAt(c, xm, ym, 0.02, 0.02, seed + 7, 3) * mortar * 0.6;
      const d = Math.min(courses.dx[x] ?? 0, dy) + chip;
      const fine = noiseAt(c, xm, ym, 0.006, 0.006, seed + 11, 2);
      if (d < half) {
        c.height[i] = -depth + fine * 0.0006;
        c.tone[i] = 0.95 + 0.04 * fine;
        c.rough[i] = Math.min(1, r.roughness + 0.08);
        continue;
      }
      const h = hash2(k, unit, seed);
      const h2 = hash2(unit, k, seed + 3);
      const big = noiseAt(c, xm, ym, length * 0.6, course * 0.8, seed + 5, 3);
      const edge = smooth(0, bevel, d - half);
      const tilt = ((h2 - 0.5) * (courses.ux[x] ?? 0) * 0.02 + (h - 0.5) * 0.001) * edge;
      const pit = fine > 0.55 ? (fine - 0.55) * 0.004 : 0;
      c.height[i] = -depth * (1 - edge) + relief * big + tilt - pit;
      c.tone[i] =
        (0.62 - variation * 0.5 + variation * h) * (1 + 0.15 * big + 0.05 * fine) - pit * 40;
      c.rough[i] = r.roughness + 0.06 * fine;
    }
  }
}
