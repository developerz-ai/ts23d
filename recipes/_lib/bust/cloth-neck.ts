// Where clothes meet the neck: the neck's real outline at the seam plane (bust.ts splits head and
// bust there, under the collar) found ON the skin the head pipeline built — so a collar hugs the
// skull stage's own neck and trapezius instead of a guessed cylinder — and the fields a garment
// needs from it: the neckline (a garment covers what lies below the seam or outside the neck's
// outline, up to the shoulders' tops) and a standing collar's band.

import type { Field } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { V } from './kit.ts';

export interface NeckSection {
  /** The neck's outline on the skin at the seam plane (closed, 32 points). */
  readonly ring: readonly V[];
  /** Its centre (on the seam plane, y = 0). */
  readonly c: V;
  /** Plan distance from `c` to the outline at plan angle θ (atan2(y, x − c.x)), metres. */
  readonly radius: (theta: number) => number;
  /** The seam plane: signed distance above it (≥ 0 = head side). */
  readonly seam: Field;
}

type Seam = { readonly field: Field; readonly at: V; readonly n: V };

/** The neck's outline on `skin` at the `seam` plane: from the seam's centre (inside the neck)
 *  out along 32 directions in the plane to where the skin is first left — the neck itself, never
 *  the shoulders beyond it — refined by bisection to 0.1 mm. Where the plane runs on inside the
 *  trapezius (no exit within `r0` metres: a low seam on sloping shoulders) the outline takes the
 *  notch where the skin comes closest to the plane — the neck's root in the shoulders. */
export function neckSection(skin: Field, seam: Seam, r0: number): NeckSection {
  const k = seam.n[0] / seam.n[2];
  const z = (x: number): number => seam.at[2] - k * (x - seam.at[0]);
  const at = (a: number, r: number): V => {
    const x = seam.at[0] + r * dmath.cos(a);
    return [x, r * dmath.sin(a), z(x)];
  };
  const ring = Array.from({ length: 32 }, (_, i): V => {
    const a = (i / 32) * Math.PI * 2;
    let lo = 0;
    let hi = -1;
    let notch = 0.02;
    let best = -Infinity;
    for (let r = 0.002; r <= r0 && hi < 0; r += 0.002) {
      const d = skin(at(a, r));
      if (d > 0) hi = r;
      else lo = r;
      if (r >= 0.02 && d > best) {
        best = d;
        notch = r;
      }
    }
    if (hi < 0) return at(a, notch);
    while (hi - lo > 1e-4) {
      const m = (lo + hi) / 2;
      if (skin(at(a, m)) > 0) hi = m;
      else lo = m;
    }
    return at(a, (lo + hi) / 2);
  });
  return section(ring, z, seam.field, r0);
}

function section(ring: V[], z: (x: number) => number, seam: Field, r0: number): NeckSection {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const raw = ring
    .map((p) => ({ a: dmath.atan2(p[1], p[0] - cx), r: dmath.hypot(p[0] - cx, p[1]) }))
    .sort((u, v) => u.a - v.a);
  // Two [1 2 1] passes round the loop: a notch found in the trapezius never kinks the outline.
  let polar = raw;
  for (let pass = 0; pass < 2; pass++)
    polar = polar.map((u, i, all) => {
      const n = all.length;
      const a = all[(i + n - 1) % n]?.r ?? u.r;
      const b = all[(i + 1) % n]?.r ?? u.r;
      return { a: u.a, r: (a + 2 * u.r + b) / 4 };
    });
  const lookup = (theta: number): number => {
    const n = polar.length;
    for (let i = 0; i < n; i++) {
      const u = polar[i];
      const v = polar[(i + 1) % n];
      if (!u || !v) break;
      const span = (v.a - u.a + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      const d = (theta - u.a + 2 * Math.PI) % (2 * Math.PI);
      if (d <= span) return u.r + ((v.r - u.r) * d) / span;
    }
    return polar[0]?.r ?? r0;
  };
  // Tabled at 256 angles: every garment asks this per sample, so it must be O(1).
  const table = Float64Array.from({ length: 257 }, (_, i) =>
    lookup(-Math.PI + (i / 128) * Math.PI),
  );
  const radius = (theta: number): number => {
    const u = ((theta + Math.PI) / Math.PI) * 128;
    const i = Math.min(Math.max(Math.floor(u), 0), 255);
    const a = table[i] ?? r0;
    return a + ((table[i + 1] ?? a) - a) * (u - i);
  };
  return { ring, c: [cx, 0, z(cx)], radius, seam };
}

/** Plan distance outside the neck's outline grown by `grow` metres (< 0 inside; ≈ metres for
 *  a round outline, scaled 0.8 so a lumpy one stays within slope 1). */
export function outsideNeck(n: NeckSection, grow: number): Field {
  return (p) => {
    const dx = p[0] - n.c[0];
    return (dmath.hypot(dx, p[1]) - n.radius(dmath.atan2(p[1], dx)) - grow) * 0.8;
  };
}

/** A garment's neckline: ≤ 0 below the seam (`drop` metres under it) or outside the neck's
 *  outline (`grow` metres wider), but never more than `cap` metres above the seam (the
 *  shoulders' tops reach ~4 cm; above that is the head). */
export function neckline(n: NeckSection, grow: number, drop: number, cap = 0.04): Field {
  const out = outsideNeck(n, grow);
  return (p) => {
    const s = n.seam(p);
    return Math.max(Math.min(s + drop, -out(p)), s - cap);
  };
}

/** A standing collar's band: from `below` metres under the seam to `above` metres over it,
 *  within `grow` of the neck (≤ 0 inside). */
export function collarBand(n: NeckSection, below: number, above: number, grow: number): Field {
  const out = outsideNeck(n, grow);
  const mid = (above - below) / 2;
  const half = (above + below) / 2;
  return (p) => Math.max(Math.abs(n.seam(p) - mid) - half, out(p));
}
