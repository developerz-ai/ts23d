// Risers for pixel lettering painted across relief (`text` with `surface` and `wrap`): where two
// touching stencil pieces sit at different depths (boards and a post standing 70 mm proud), the
// paint also covers the step between them, as a brush does. One riser per run of shared edge
// (mergeRisers joins the pieces' edges that continue one another), from the top of the lower
// piece to the underside of the higher one, facing the lower side. Without them a 3/4 view shows
// the member's bare side through the letter and the word reads chopped. cellPieces lays the
// pieces out: one per run of pixel cells sitting on one surface offset.

import type { PixelRect } from './text-layout.ts';

/** A stencil rectangle in the text frame (metres along / up) on a surface offset `s`. */
export interface Piece {
  readonly u0: number;
  readonly u1: number;
  readonly v0: number;
  readonly v1: number;
  /** Surface offset under this piece. */
  readonly s: number;
}

/** The step between two pieces: a quad in the plane `axis` = `at`, spanning a0..a1 × w0..w1. */
export interface Riser {
  /** 'u': a plane across the reading direction (facing ±along); 'v': a horizontal one (±up). */
  readonly axis: 'u' | 'v';
  readonly at: number;
  /** Extent along the other in-plane axis. */
  readonly a0: number;
  readonly a1: number;
  /** Offsets along the facing normal: lower piece's paint up to the higher piece. */
  readonly w0: number;
  readonly w1: number;
  /** +1 / −1: the side of `at` the lower piece is on (the riser faces it). */
  readonly out: 1 | -1;
}

const EPS = 1e-9;

/**
 * Risers between every pair of touching pieces whose paint is at different depths. `top` is the
 * painted face above a piece's surface (lift of a decal, depth of a raised letter) and `under`
 * where the higher piece starts (its decal face, or the foot of its raised box).
 */
export function risers(pieces: readonly Piece[], top: number, under: number): Riser[] {
  const out: Riser[] = [];
  for (const hi of pieces)
    for (const lo of pieces) {
      const w0 = lo.s + top;
      const w1 = hi.s + under;
      if (!(w1 - w0 > EPS)) continue;
      const v0 = Math.max(hi.v0, lo.v0);
      const v1 = Math.min(hi.v1, lo.v1);
      const u0 = Math.max(hi.u0, lo.u0);
      const u1 = Math.min(hi.u1, lo.u1);
      if (v1 - v0 > EPS) {
        if (Math.abs(lo.u1 - hi.u0) < EPS)
          out.push({ axis: 'u', at: hi.u0, a0: v0, a1: v1, w0, w1, out: -1 });
        else if (Math.abs(lo.u0 - hi.u1) < EPS)
          out.push({ axis: 'u', at: hi.u1, a0: v0, a1: v1, w0, w1, out: 1 });
      } else if (u1 - u0 > EPS) {
        if (Math.abs(lo.v1 - hi.v0) < EPS)
          out.push({ axis: 'v', at: hi.v0, a0: u0, a1: u1, w0, w1, out: -1 });
        else if (Math.abs(lo.v0 - hi.v1) < EPS)
          out.push({ axis: 'v', at: hi.v1, a0: u0, a1: u1, w0, w1, out: 1 });
      }
    }
  return out;
}

/**
 * Risers that continue one another (same step, same depths, end to end) as one: a stem's rows,
 * split into pieces by the layout, cross a post edge as one run. Groups keep the order they first
 * appear in; within a group the runs go by `a0`.
 */
export function mergeRisers(rs: readonly Riser[]): Riser[] {
  const groups = new Map<string, Riser[]>();
  for (const r of rs) {
    const key = `${r.axis}|${r.at}|${r.out}|${r.w0}|${r.w1}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out: Riser[] = [];
  for (const g of groups.values()) {
    const runs = [...g].sort((p, q) => p.a0 - q.a0);
    let cur = runs[0];
    for (const r of runs.slice(1)) {
      if (cur && Math.abs(r.a0 - cur.a1) < EPS) cur = { ...cur, a1: Math.max(cur.a1, r.a1) };
      else {
        if (cur) out.push(cur);
        cur = r;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/**
 * Wrapped pieces: every pixel cell sits on the highest surface under it (corners and centre),
 * then cells at one offset merge into rectangles, down a column first and then across, so a stem
 * on the boards is one piece and only a stroke that crosses a step splits (D456). Null when every
 * cell sits at one offset: the plain pieces already fit, and keep their bytes.
 */
export function cellPieces(
  rects: readonly PixelRect[],
  px: number,
  start: number,
  surface: (u: number, v: number) => number,
): Piece[] | null {
  const s = new Map<string, number>();
  const key = (c: number, r: number): string => `${c},${r}`;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let cols = 0;
  for (const q of rects)
    for (let r = q.r0; r < q.r1; r++)
      for (let c = q.c0; c < q.c1; c++) {
        const v0 = (6 - r) * px;
        let top = Number.NEGATIVE_INFINITY;
        for (const fu of [0.02, 0.5, 0.98])
          for (const fv of [0.02, 0.5, 0.98])
            top = Math.max(top, surface(start + (c + fu) * px, v0 + fv * px));
        s.set(key(c, r), top);
        lo = Math.min(lo, top);
        hi = Math.max(hi, top);
        cols = Math.max(cols, c + 1);
      }
  if (!(hi - lo >= 1e-6)) return null;
  const used = new Set<string>();
  const free = (c: number, r: number, at: number): boolean => {
    const v = s.get(key(c, r));
    return v !== undefined && !used.has(key(c, r)) && Math.abs(v - at) < 1e-6;
  };
  const out: Piece[] = [];
  for (let c0 = 0; c0 < cols; c0++)
    for (let r0 = 0; r0 < 7; r0++) {
      const at = s.get(key(c0, r0));
      if (at === undefined || used.has(key(c0, r0))) continue;
      let r1 = r0 + 1;
      while (r1 < 7 && free(c0, r1, at)) r1++;
      let c1 = c0 + 1;
      const column = (c: number): boolean => {
        for (let r = r0; r < r1; r++) if (!free(c, r, at)) return false;
        return true;
      };
      while (column(c1)) c1++;
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) used.add(key(c, r));
      out.push({
        u0: start + c0 * px,
        u1: start + c1 * px,
        v0: (7 - r1) * px,
        v1: (7 - r0) * px,
        s: at,
      });
    }
  return out;
}
