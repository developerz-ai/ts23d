// assertPolygonValid: 2D contours an extrude/lathe/triangulator can trust — each has ≥ 3 points
// and area, no edge crosses another edge (in its own contour or any other), and orientation
// follows nesting: outer contours counter-clockwise, holes (inside an odd number of others)
// clockwise. Flip `outer` to 'cw' for y-down sources such as raw SVG.
//   it('emblem outline is clean', () => assertPolygonValid(svgShape(star).contours));

import type { Vec2 } from '../core/index.ts';
import type { Finding } from '../qa/index.ts';
import { failOn } from './compiled.ts';

export interface PolygonOptions {
  /** Winding of outer contours. Default 'ccw' (y up); holes wind the other way. */
  readonly outer?: 'ccw' | 'cw';
  /** Smallest |area| a contour may have, m². Default 1e-10. */
  readonly minArea?: number;
}

const area = (c: readonly Vec2[]): number => {
  let s = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i] ?? [0, 0];
    const b = c[(i + 1) % c.length] ?? [0, 0];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

const orient = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Proper crossing of segments ab and cd (touching at a shared end does not count). */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function inside(p: Vec2, c: readonly Vec2[]): boolean {
  let odd = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i] ?? [0, 0];
    const b = c[j] ?? [0, 0];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      odd = !odd;
  }
  return odd;
}

const pt = (p: Vec2 | undefined): string => (p ? `(${p[0].toFixed(3)}, ${p[1].toFixed(3)})` : '');

/** Every problem with a set of contours, as findings (empty = valid). */
export function polygonFindings(
  contours: readonly (readonly Vec2[])[],
  o: PolygonOptions = {},
): Finding[] {
  const out: Finding[] = [];
  const minArea = o.minArea ?? 1e-10;
  const edges: { c: number; i: number; a: Vec2; b: Vec2 }[] = [];
  contours.forEach((c, ci) => {
    const a = area(c);
    if (c.length < 3 || Math.abs(a) < minArea)
      out.push({
        gate: 'polygon',
        message: `contour ${ci} has ${c.length} point(s) and area ${a.toExponential(2)} m²`,
        fix: 'drop degenerate contours (fewer than 3 points or zero area) before extruding',
      });
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      if (p && q) edges.push({ c: ci, i, a: p, b: q });
    }
  });
  for (let x = 0; x < edges.length; x++)
    for (let y = x + 1; y < edges.length; y++) {
      const e = edges[x];
      const f = edges[y];
      if (!e || !f || !crosses(e.a, e.b, f.a, f.b)) continue;
      out.push({
        gate: 'polygon',
        message:
          e.c === f.c
            ? `contour ${e.c} crosses itself: edge ${e.i} ${pt(e.a)} and edge ${f.i} ${pt(f.a)}`
            : `contour ${e.c} edge ${e.i} crosses contour ${f.c} edge ${f.i} near ${pt(f.a)}`,
        fix: 'reorder the points so the outline never crosses itself (a figure-eight is two contours); holes must sit fully inside their outer contour',
      });
      if (out.length > 20) return out;
    }
  const ccwOuter = (o.outer ?? 'ccw') === 'ccw';
  contours.forEach((c, ci) => {
    const first = c[0];
    if (!first || c.length < 3) return;
    const depth = contours.filter((d, di) => di !== ci && d.length >= 3 && inside(first, d)).length;
    const hole = depth % 2 === 1;
    const ccw = area(c) > 0;
    if (ccw === (hole ? !ccwOuter : ccwOuter)) return;
    out.push({
      gate: 'polygon',
      message: `contour ${ci} is ${hole ? 'a hole' : 'an outer contour'} wound ${ccw ? 'counter-clockwise' : 'clockwise'}`,
      fix: `reverse contour ${ci}: outer contours wind ${ccwOuter ? 'counter-clockwise' : 'clockwise'}, holes the other way`,
    });
  });
  return out;
}

/** Throws T3D_QA_FAILED listing every degenerate, crossing or mis-wound contour. */
export function assertPolygonValid(
  contours: readonly (readonly Vec2[])[],
  o: PolygonOptions = {},
): void {
  failOn(
    'polygon',
    polygonFindings(contours, o).map((finding) => ({ finding })),
  );
}
