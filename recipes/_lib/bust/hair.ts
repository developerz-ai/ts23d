// Stylised hair as sculpted LOCKS, shared by the busts: a hair mass (the skull pushed out by a
// thickness inside a hairline), then clumps that taper, overlap and follow the skull along flow
// lines, with grooves between them and finer strands at the hairline. Each lock is toned root →
// tip (dark roots and undersides, lighter tips) by colour segments that blend along it.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { chain, clayOn, cross, norm, type Surface, sub, taper, type V } from './kit.ts';

export const mix = (a: V, b: V, t: number): V => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** One free lock: a tapered chain along `pts`, coloured root → tip in `seg` blended segments. */
export function lock(
  pts: readonly V[],
  r0: number,
  r1: number,
  root: V,
  tip: V,
  o: { readonly belly?: number; readonly seg?: number; readonly mirror?: boolean } = {},
): SculptEdit[] {
  const n = pts.length;
  const seg = o.seg ?? 3;
  const radii = taper(n, r0, r1, o.belly ?? 0);
  const out: SculptEdit[] = [];
  const per = Math.ceil((n - 1) / seg);
  for (let s = 0; s < seg; s++) {
    const a = s * per;
    const b = Math.min(n - 1, a + per);
    if (b <= a) break;
    const t = (s + 0.5) / seg;
    out.push(
      chain(pts.slice(a, b + 1), radii.slice(a, b + 1), {
        color: mix(root, tip, t * t),
        blend: r0 * 0.5,
        join: r0 * 0.2,
        ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
      }),
    );
  }
  return out;
}

/**
 * A flat ribbon lock (a front strand falling past the face): `strands` parallel locks side by side
 * across `width`, their faces turned to `facing`, merged into one band that reads as a lock with
 * strand grooves — volume and a flat face, not a wire. Width and thickness taper root → tip.
 */
export function ribbon(
  pts: readonly V[],
  facing: V,
  width: readonly [number, number],
  thick: readonly [number, number],
  root: V,
  tip: V,
  o: { readonly strands?: number; readonly mirror?: boolean } = {},
): SculptEdit[] {
  const n = pts.length;
  const k = o.strands ?? 3;
  const out: SculptEdit[] = [];
  for (let j = 0; j < k; j++) {
    const off = k === 1 ? 0 : j / (k - 1) - 0.5;
    const line = pts.map((p, i): V => {
      const a = pts[Math.max(0, i - 1)] ?? p;
      const b = pts[Math.min(n - 1, i + 1)] ?? p;
      const side = norm(cross(sub(b, a), facing));
      const t = i / Math.max(1, n - 1);
      const w = width[0] + (width[1] - width[0]) * t;
      return [p[0] + side[0] * w * off, p[1] + side[1] * w * off, p[2] + side[2] * w * off];
    });
    // Outer strands a touch thinner, so the band's section is a flat lens.
    const edge = 1 - 0.35 * Math.abs(off) * 2;
    out.push(
      ...lock(line, thick[0] * edge, thick[1] * edge, root, tip, {
        belly: thick[0] * 0.15,
        ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
      }),
    );
  }
  return out;
}

/** The hair mass: the scalp pushed out by `thick`, inside the hairline `region` (≤ 0), the
 *  thickness easing to zero over `fade` metres at the hairline so the hair grows out of the skin
 *  instead of sitting on it like a cap. Added into the skin sculpt (one surface, no seam). */
export function hairMass(
  scalp: Field,
  thick: number,
  region: Field,
  bounds: readonly [V, V],
  color: V,
  fade = 0.012,
): SculptEdit {
  return {
    field: (p) => {
      const r = region(p);
      if (r > 0) return Math.max(scalp(p), r);
      const t = Math.min(1, -r / fade);
      const w = t * t * (3 - 2 * t);
      return scalp(p) - thick * w - 0.0004;
    },
    bounds,
    color,
    blend: 0.002,
  };
}

/** Locks lying ON a hair mass along flow lines (equal point counts): a raised clump per line
 *  (spaced about a clump apart, so the mass reads as separate overlapping locks). */
export function flowLocks(
  hair: Surface,
  lines: readonly (readonly V[])[],
  r: number,
  o: { readonly root: V; readonly tip: V; readonly mirror?: boolean },
): SculptEdit[] {
  const out: SculptEdit[] = [];
  const m = o.mirror === undefined ? {} : { mirror: o.mirror };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? [];
    const n = Math.max(6, line.length * 4);
    out.push(
      clayOn(hair, line, r, r * 0.9, { n, blend: r * 0.35, color: mix(o.root, o.tip, 0.6), ...m }),
    );
    // The valley between neighbours is left to the clumps' own fillets and the cavity tone: a
    // carved groove cut holes where the mass is thin.
  }
  return out;
}
