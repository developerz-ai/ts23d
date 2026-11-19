// Risers for pixel lettering painted across relief (`text` with `surface` and `wrap`): where two
// touching stencil pieces sit at different depths (boards and a post standing 70 mm proud), the
// paint also covers the step between them, as a brush does. One quad per shared edge, from the
// top of the lower piece to the underside of the higher one, facing the lower side. Without them
// a 3/4 view shows the member's bare side through the letter and the word reads chopped.

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
