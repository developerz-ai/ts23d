// Tools for the parts that fill a panel opening: the hole's outline on the surface, a recessed
// pocket (tub) behind it, a surface-following cover (lamp lens), and a bar grille spanning it.
// All in the left half; callers mirror. Points sit a few mm behind the skin so they never poke
// through the panel, and pockets close against the panel's flange.

import type { Mesh, StripId, Vec3 } from '@developerz.ai/ts23d';
import { loft, merge } from '@developerz.ai/ts23d';
import { add, beamBetween, lerp3, mul, sub } from '../lib/geo.ts';
import { type ColorFn, normalAt, patch, type Surface } from '../lib/grid.ts';
import { type Hole, holeG, holeRows, holeUc } from './panels.ts';

/** Point on the surface, pushed `d` metres inward along the normal. */
export const inward = (S: Surface, s: number, u: number, d: number): Vec3 =>
  sub(S.row(s)(u), mul(normalAt(S, s, u), d));

/** Closed outline of a hole (counter-round), `n` points per side, `d` behind the skin. */
export function outline(S: Surface, h: Hole, d: number, n = 24, shrink = 1): Vec3[] {
  const e = edges(S, h, d, n, shrink);
  return [...e.top, ...e.bottom.reverse()];
}

/** The hole's two long edges (low-u "top" and high-u "bottom"), both running along +s. */
export function edges(
  S: Surface,
  h: Hole,
  d: number,
  n = 24,
  shrink = 1,
): { top: Vec3[]; bottom: Vec3[] } {
  const rows = holeRows(h, n).filter((s) => holeG(h, s) > 1e-4 || h.open);
  const top: Vec3[] = [];
  const bottom: Vec3[] = [];
  for (const s of rows) {
    const g = h.open && holeG(h, s) === 0 ? 0 : holeG(h, s);
    const c = holeUc(h, s);
    top.push(inward(S, s, c - h.hu * g * shrink, d));
    bottom.push(inward(S, s, c + h.hu * g * shrink, d));
  }
  return { top, bottom };
}

/** Centre of a hole on the surface and its normal. */
export function holeCentre(S: Surface, h: Hole): { p: Vec3; n: Vec3 } {
  return { p: S.row(h.sc)(h.uc), n: normalAt(S, h.sc, h.uc) };
}

/** A recessed tub behind a hole: walls from the flange back to a floor `depth` deep. */
export function pocket(
  S: Surface,
  h: Hole,
  depth: number,
  color: Vec3,
  strip: StripId = 'plastic',
  n = 20,
): Mesh {
  const a = outline(S, h, 0.008, n, 1.0);
  const c = holeCentre(S, h);
  const deep = a.map((p) =>
    add(lerp3(p, sub(c.p, mul(c.n, depth)), 0.18), mul(c.n, -depth * 0.82)),
  );
  return loft({ rings: [a, deep], color, strip, capEnd: true });
}

/** The hole's own surface region (lamp cover, lens), `d` behind the skin. */
export function cover(
  S: Surface,
  h: Hole,
  d: number,
  color: ColorFn,
  strip: StripId,
  nu = 16,
): Mesh {
  const rs = holeRows(h, nu <= 4 ? 4 : 20);
  const rowsIn = rs.filter((s) => holeG(h, s) > 0);
  return patch(S, {
    s0: rowsIn[0] ?? h.sc,
    s1: rowsIn[rowsIn.length - 1] ?? h.sc,
    ns: rowsIn.length - 1,
    sAt: (i) => rowsIn[i] ?? h.sc,
    nu,
    lo: (s) => holeUc(h, s) - h.hu * holeG(h, s) * 0.995,
    hi: (s) => holeUc(h, s) + h.hu * holeG(h, s) * 0.995,
    color,
    strip,
    thickness: 0,
    lift: -d,
  });
}

/** Crossed bars spanning a hole at depth d: `nu` bars along s, `ns` bars along u. */
export function grille(
  S: Surface,
  h: Hole,
  d: number,
  ns: number,
  nu: number,
  w: number,
  color: Vec3,
): Mesh {
  const bars: Mesh[] = [];
  const s0 = h.sc - h.hs;
  const s1 = h.open === 'end' ? h.sc + h.hs : h.sc + h.hs;
  for (let k = 1; k < nu; k++) {
    const f = k / nu;
    const pts: Vec3[] = [];
    for (let i = 0; i <= 16; i++) {
      const s = s0 + ((s1 - s0) * i) / 16;
      const g = holeG(h, s);
      if (g <= 0.02) continue;
      pts.push(inward(S, s, holeUc(h, s) - h.hu * g + 2 * h.hu * g * f, d));
    }
    for (let i = 0; i + 1 < pts.length; i++)
      bars.push(beamBetween(pts[i] ?? [0, 0, 0], pts[i + 1] ?? [0, 0, 0], w, w * 1.6, color));
  }
  for (let k = 0; k <= ns; k++) {
    const s = s0 + ((s1 - s0) * (k + 0.5)) / (ns + 1);
    const g = holeG(h, s);
    if (g <= 0.05) continue;
    const c = holeUc(h, s);
    const a = inward(S, s, c - h.hu * g, d + 0.004);
    const b = inward(S, s, c + h.hu * g, d + 0.004);
    bars.push(beamBetween(a, b, w, w * 1.6, color));
  }
  return merge(bars);
}
