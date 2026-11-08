// An SVG drawing → a binary mask, filled the way a person drawing a silhouette means it: every
// closed shape is solid and overlapping shapes union (a handle drawn over a body stays filled);
// a shape lying entirely inside an odd number of others is a hole (an eye, a lightening hole).

import type { Vec2 } from '../core/index.ts';
import { svgShape } from '../primitives/index.ts';
import type { Mask } from './mask.ts';

/** Even-odd point-in-polygon. */
function inside(p: Vec2, poly: readonly Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}

/** Fill the drawing into a mask `size` px on its long side (row 0 = top of the paper). */
export function maskOfSvg(svg: string, size = 256): Mask {
  const shape = svgShape(svg, { size: 1, tolerance: 0.0005 });
  const [x0, y0] = shape.min;
  const [x1, y1] = shape.max;
  const s = (size - 2) / Math.max(x1 - x0, y1 - y0, 1e-9);
  const width = Math.max(1, Math.ceil((x1 - x0) * s) + 2);
  const height = Math.max(1, Math.ceil((y1 - y0) * s) + 2);
  // Pixel space, Y down.
  const polys = shape.contours
    .filter((c) => c.points.length >= 3)
    .map((c) => c.points.map((p): Vec2 => [(p[0] - x0) * s + 1, (y1 - p[1]) * s + 1]));
  const depth = polys.map(
    (poly, i) => polys.filter((other, j) => j !== i && poly.every((p) => inside(p, other))).length,
  );
  const count = new Int16Array(width * height);
  polys.forEach((poly, i) => {
    const sign = (depth[i] ?? 0) % 2 === 0 ? 1 : -1;
    for (let y = 0; y < height; y++) {
      const py = y + 0.5;
      const xs: number[] = [];
      for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) {
        const a = poly[k];
        const b = poly[j];
        if (a && b && a[1] <= py !== b[1] <= py)
          xs.push(a[0] + ((py - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (
          let x = Math.max(0, Math.ceil((xs[k] ?? 0) - 0.5));
          x < Math.min(width, (xs[k + 1] ?? 0) - 0.5);
          x++
        )
          count[y * width + x] = (count[y * width + x] ?? 0) + sign;
    }
  });
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (count[i] ?? 0) > 0 ? 1 : 0;
  return { width, height, data };
}
