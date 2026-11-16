// Leather straps for bust gear (baldrics, belts, pauldron straps): a flat strap following a
// surface — thin rounded boxes along the path, their thickness along the skin's normal — and its
// stitching, short raised thread dashes a few millimetres in from each edge. Shared by any bust
// that straps something on.

import type { SculptEdit } from '@developerz.ai/ts23d';
import { add, cross, dot, k, local, mul, norm, type Surface, sub, type V } from './kit.ts';

/** A flat strap `width` wide and `thick` thick lying on `sf` along `path`. */
export function strap(sf: Surface, path: readonly V[], width: number, thick: number): SculptEdit[] {
  const pts = path.map((p) => sf.off(p, thick / 2 + 0.0015));
  const out: SculptEdit[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const mid = mul(add(a, b), 0.5);
    const d = sub(b, a);
    const l = Math.hypot(d[0], d[1], d[2]);
    const u = norm(d);
    const n0 = sf.normal(mid);
    const w = norm(sub(n0, mul(u, dot(n0, u))));
    const f = { o: mid, u, v: cross(w, u), w };
    out.push(
      local(
        f,
        k.box([0, 0, 0], [l / 2 + width * 0.15, width / 2, thick / 2], thick * 0.45),
        [
          [-l / 2 - width, -width, -width],
          [l / 2 + width, width, width],
        ],
        { blend: thick * 0.9 },
      ),
    );
  }
  return out;
}

/** Stitching along both edges of a strap: thread dashes 4 mm in from each edge, every 8 mm. */
export function stitches(
  sf: Surface,
  path: readonly V[],
  width: number,
  thick: number,
  color: V,
): SculptEdit[] {
  const out: SculptEdit[] = [];
  const pts = path.map((p) => sf.off(p, thick + 0.0015));
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (!a || !b) continue;
    const u = norm(sub(b, a));
    const side = norm(cross(sf.normal(a), u));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    for (let d = 0.004; d < l; d += 0.008)
      for (const e of [-1, 1]) {
        const c = add(add(a, mul(u, d)), mul(side, e * (width / 2 - 0.004)));
        out.push({
          shape: 'capsule',
          at: add(c, mul(u, -0.0022)),
          to: add(c, mul(u, 0.0022)),
          size: 0.0011,
          color,
        });
      }
  }
  return out;
}
