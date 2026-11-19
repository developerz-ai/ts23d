// Tools for the parts that fill a panel opening: the hole's outline on the surface, a recessed
// pocket (tub) behind it, a surface-following cover (lamp lens), and a bar grille across a duct.
// All in the left half; callers mirror. Points sit a few mm behind the skin so they never poke
// through the panel, and pockets close against the panel's flange.

import type { Mesh, StripId, Vec3 } from '@developerz.ai/ts23d';
import { loft, merge } from '@developerz.ai/ts23d';
import { add, beamBetween, len, lerp3, mul, sub, unit } from '../lib/geo.ts';
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
  const rs = holeRows(h, nu <= 4 ? 4 : 8);
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

/** Point at fractional row `t` (0 … rows − 1) and fraction `f` across, on the ruled sheet
 *  between two edge lines sampled at the same rows. */
function between(top: readonly Vec3[], bottom: readonly Vec3[], t: number, f: number): Vec3 {
  const i = Math.min(top.length - 2, Math.max(0, Math.floor(t)));
  const k = t - i;
  const a = lerp3(top[i] ?? [0, 0, 0], top[i + 1] ?? [0, 0, 0], k);
  const b = lerp3(bottom[i] ?? [0, 0, 0], bottom[i + 1] ?? [0, 0, 0], k);
  return lerp3(a, b, f);
}

/**
 * Crossed bars on the sheet ruled between a duct's two walls (`top` and `bottom`: the same rows
 * of each wall at the grille's depth): `nu − 1` bars along the duct and `ns + 1` across it. Both
 * sets lie in the one sheet, so every crossing is a real joint, and the cross bars run `into`
 * metres past the sheet's edges into the walls that carry them.
 */
export function grille(
  top: readonly Vec3[],
  bottom: readonly Vec3[],
  ns: number,
  nu: number,
  w: number,
  color: Vec3,
  into = 0.003,
): Mesh {
  const bars: Mesh[] = [];
  const last = top.length - 1;
  const open = (i: number): boolean =>
    len(sub(top[i] ?? [0, 0, 0], bottom[i] ?? [0, 0, 0])) > 8 * w;
  for (let k = 1; k < nu; k++) {
    const f = k / nu;
    for (let i = 0; i < last; i++)
      if (open(i) && open(i + 1))
        bars.push(
          beamBetween(
            between(top, bottom, i, f),
            between(top, bottom, i + 1, f),
            w,
            w * 1.6,
            color,
          ),
        );
  }
  for (let k = 0; k <= ns; k++) {
    const t = (last * (k + 0.5)) / (ns + 1);
    const a = between(top, bottom, t, 0);
    const b = between(top, bottom, t, 1);
    if (len(sub(a, b)) <= 8 * w) continue;
    const out = mul(unit(sub(a, b)), into);
    bars.push(beamBetween(add(a, out), sub(b, out), w, w * 1.6, color));
  }
  return merge(bars);
}
