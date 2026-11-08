// The two flat shapes a pen stroke is built from, in the letter plane (x along, y up): a ribbon
// (quad strip between a right and a left offset line, optionally a closed loop) and a fan (centre
// + ring: round caps and joins, square caps, bevels, dots). Each piece carries its triangles
// (counter-clockwise seen from the front) and its wall chains (outline runs with the outside on
// their right) so text-vector.ts can raise it into a solid without knowing its shape.

export interface Piece {
  /** x0, y0, x1, y1, … */
  readonly xy: number[];
  /** Counter-clockwise triangles, indices into xy pairs. */
  readonly tri: number[];
  /** Outline runs (point indices), outside on the right; a closed run repeats its first index. */
  readonly walls: number[][];
}

/** Triangles a·b·c clockwise? Flip so the face points at the viewer. */
function ccw(xy: readonly number[], tri: number[], a: number, b: number, c: number): void {
  const ax = xy[2 * a] ?? 0;
  const ay = xy[2 * a + 1] ?? 0;
  const cr =
    ((xy[2 * b] ?? 0) - ax) * ((xy[2 * c + 1] ?? 0) - ay) -
    ((xy[2 * b + 1] ?? 0) - ay) * ((xy[2 * c] ?? 0) - ax);
  if (cr >= 0) tri.push(a, b, c);
  else tri.push(a, c, b);
}

/** Fan from (cx, cy) over `ring` (already counter-clockwise around the centre). */
export function fan(cx: number, cy: number, ring: readonly number[], closed: boolean): Piece {
  const xy = [cx, cy, ...ring];
  const n = ring.length / 2;
  const tri: number[] = [];
  const wall: number[] = [];
  for (let k = 1; k <= n; k++) wall.push(k);
  for (let k = 1; k < n; k++) ccw(xy, tri, 0, k, k + 1);
  if (closed) {
    ccw(xy, tri, 0, n, 1);
    wall.push(1);
  }
  return { xy, tri, walls: [wall] };
}

/** Ribbon between right offsets `r` and left offsets `l` (same count; r is the right side
 *  walking forward). Closed: the last rung joins the first. */
export function ribbon(r: readonly number[], l: readonly number[], closed: boolean): Piece {
  const n = r.length / 2;
  const xy = [...r, ...l];
  const tri: number[] = [];
  const quad = (i: number, j: number): void => {
    tri.push(i, j, n + j, i, n + j, n + i);
  };
  for (let i = 0; i + 1 < n; i++) quad(i, i + 1);
  if (closed) quad(n - 1, 0);
  const right: number[] = [];
  const left: number[] = [];
  for (let i = 0; i < n; i++) {
    right.push(i);
    left.push(2 * n - 1 - i);
  }
  if (closed) {
    right.push(0);
    left.push(2 * n - 1);
  }
  return { xy, tri, walls: [right, left] };
}

/** Points on an arc around (cx, cy), radius `rad`, from angle a0 through a1 (CCW if a1 > a0). */
export function arc(
  cx: number,
  cy: number,
  rad: number,
  a0: number,
  a1: number,
  steps: number,
): number[] {
  const out: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    out.push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  return out;
}
