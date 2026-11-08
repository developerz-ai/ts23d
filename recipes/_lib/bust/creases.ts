// Intended creases for the busts, declared from the SAME geometry that sculpts them: small spheres
// (radius ≤ 3 cm) strung along each intended fold — a lid crease, a nostril, the lip line, an
// ear's helix and root, each hair or beard lock's groove, a garment edge — so QA `connections`
// excuses only seams lying on a fold the recipe meant (QA counts a seam declared when the regions
// hold its centre or ≥ 80 % of its trace). Every region sits ON its fold. Anything else QA finds
// is a real seam to fix with a blend radius, never a region to widen.

import type { Field, IntendedCrease } from '@developerz.ai/ts23d';
import { add, flipY, len, mul, norm, sub, type V } from './kit.ts';

/** Largest region a bust may declare: a fold, not an area. */
export const MAX_CREASE = 0.03;

const at3 = (p: V): [number, number, number] => [p[0], p[1], p[2]];

/** Spheres of radius `r` every ≈ r along the polyline `pts` (both sides with `mirror`). */
export function creaseCurve(
  name: string,
  part: string,
  pts: readonly V[],
  r: number,
  why: string,
  mirror = false,
): IntendedCrease[] {
  const radius = Math.min(r, MAX_CREASE);
  // Resample by arc length: a sphere every `radius`, plus the end point.
  const out: V[] = [];
  let next = 0;
  let walked = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] ?? [0, 0, 0];
    const b = pts[i + 1] ?? a;
    const d = len(sub(b, a));
    for (; next <= walked + d && d > 0; next += radius)
      out.push(add(a, mul(sub(b, a), (next - walked) / d)));
    walked += d;
  }
  const last = pts[pts.length - 1];
  if (last) out.push(last);
  const sides = mirror ? [1, -1] : [1];
  return sides.flatMap((s) =>
    out.map((p, i) => ({
      name: `${name}${mirror ? (s === 1 ? '_l' : '_r') : ''}_${i}`,
      part,
      at: at3(s === 1 ? p : flipY(p)),
      radius,
      why,
    })),
  );
}

/** A closed ring fold (a collar or scarf on the neck): the ring as one closed curve. */
export function ringCreases(
  name: string,
  part: string,
  ring: readonly V[],
  r: number,
  why: string,
): IntendedCrease[] {
  return creaseCurve(name, part, [...ring, ring[0] ?? [0, 0, 0]], r, why);
}

/** One region (a knot, a small fold) at `p`, mirrored when asked. */
export function creaseAt(
  name: string,
  part: string,
  p: V,
  r: number,
  why: string,
  mirror = false,
): IntendedCrease[] {
  return creaseCurve(name, part, [p], r, why, mirror);
}

/** Unit gradient of a field (central differences, 0.4 mm). */
function grad(f: Field, p: V): V {
  const h = 4e-4;
  return norm([
    f([p[0] + h, p[1], p[2]]) - f([p[0] - h, p[1], p[2]]),
    f([p[0], p[1] + h, p[2]]) - f([p[0], p[1] - h, p[2]]),
    f([p[0], p[1], p[2] + h]) - f([p[0], p[1], p[2] - h]),
  ]);
}

/**
 * A garment or hair-mass EDGE as declared creases: where `region` (≤ 0 inside the garment) meets
 * the `body` surface, found by a deterministic grid over `box` (step r / 3, each point nudged
 * onto both surfaces), then thinned to one sphere every ¾ r (no gaps along the edge). Left half only (y ≥ 0) and
 * mirrored, unless `mirror` is false.
 */
export function edgeCreases(
  name: string,
  part: string,
  body: Field,
  region: Field,
  box: readonly [V, V],
  r: number,
  why: string,
  mirror = true,
): IntendedCrease[] {
  const radius = Math.min(r, MAX_CREASE);
  const step = radius / 3;
  const [lo, hi] = box;
  const found: V[] = [];
  const y0 = mirror ? Math.max(0, lo[1]) : lo[1];
  for (let x = lo[0]; x <= hi[0]; x += step)
    for (let y = y0; y <= hi[1]; y += step)
      for (let z = lo[2]; z <= hi[2]; z += step) {
        const p: V = [x, y, z];
        if (Math.abs(body(p)) > step || Math.abs(region(p)) > step) continue;
        // A few alternating projections, kept only when they land near the grid point (many
        // steps drift along the curve where a blended field is not a true distance).
        let q = p;
        for (let k = 0; k < 4; k++) {
          q = sub(q, mul(grad(body, q), body(q)));
          q = sub(q, mul(grad(region, q), region(q)));
        }
        if (Math.abs(body(q)) > 0.0015 || Math.abs(region(q)) > 0.0015) continue;
        if (len(sub(q, p)) > 2 * step) continue;
        if (found.some((f) => len(sub(f, q)) < radius * 0.75)) continue;
        found.push(q);
      }
  return found.flatMap((p, i) => creaseAt(`${name}_${i}`, part, p, radius, why, mirror));
}
