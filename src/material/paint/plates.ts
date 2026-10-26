// Riveted iron plates (kind 'plates'): lapped plates (each overlaps its left neighbour by a
// step), domed rivet rows along every seam, hammered surface, rust streaks running down from
// rivets, chipped paint showing bare metal on edges.
// params: width 1.0 · height 0.5 · lap 0.003 · rivet 0.014 (radius) · pitch 0.09 · inset 0.05
//         rust 0.4 · chips 0.3

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { Courses } from './courses.ts';
import { rustStreaks } from './masks.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

/** Distance (m) from `q` to the nearest multiple of `pitch`. */
function along(q: number, pitch: number): number {
  const t = q / pitch;
  return Math.abs(t - Math.round(t)) * pitch;
}

export function paintPlates(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const lap = param(p, 'lap', 0.003);
  const rivet = param(p, 'rivet', 0.014);
  const pitch = param(p, 'pitch', 0.09);
  const inset = param(p, 'inset', 0.05);
  const chips = param(p, 'chips', 0.3);
  const metal = r.metalness ?? 0;
  const plates = new Courses(c, {
    course: param(p, 'height', 0.5),
    length: param(p, 'width', 1),
    irregular: 0,
    stagger: 0.5,
    seed,
  });
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const k = plates.at(ym);
    const dy = Math.min(ym - plates.y0, plates.y1 - ym);
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const ux = plates.ux[x] ?? 0;
      const dx = plates.dx[x] ?? 0;
      const id = plates.id[x] ?? 0;
      const hammer = noiseAt(c, xm, ym, 0.05, 0.05, seed + 3, 3);
      const fine = noiseAt(c, xm, ym, 0.004, 0.004, seed + 9, 2);
      // Lap: the plate sits `lap` proud of the one to its left; a tiny groove on every seam.
      const seam = Math.min(dx, dy);
      let h = lap * smooth(0, 0.004, ux) + 0.0004 * hammer - 0.001 * (1 - smooth(0, 0.0015, seam));
      // Rivet rows: `inset` from each vertical seam and from each course edge, every `pitch`.
      const ry = Math.abs(dy - inset);
      const rx = Math.abs(dx - inset);
      const d1 = Math.sqrt(rx * rx + along(ym - plates.y0, pitch) ** 2);
      const d2 = Math.sqrt(ry * ry + along(xm, pitch) ** 2);
      const d = Math.min(dx > inset * 2 ? 1 : d1, dy > inset * 2 ? 1 : d2);
      const dome = d < rivet ? Math.sqrt(1 - (d / rivet) ** 2) : 0;
      h += dome * rivet * 0.5;
      const chip = smooth(
        0.35,
        0.45,
        noiseAt(c, xm, ym, 0.03, 0.03, seed + 21, 4) - (seam * 6 + 0.2) + chips * 0.3,
      );
      c.height[i] = h - chip * 0.0003;
      c.tone[i] =
        (0.8 + 0.06 * hash2(k, id, seed)) * (1 + 0.06 * hammer + 0.03 * fine) * (1 + 0.15 * dome);
      c.rough[i] = r.roughness + 0.08 * fine - 0.25 * chip;
      c.metal[i] = metal + (1 - metal) * chip;
    }
  }
  rustStreaks(c, param(p, 'rust', 0.4), seed + 77);
}
