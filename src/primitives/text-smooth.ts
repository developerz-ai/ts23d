// Curve resolution for vector lettering, the LOD knob of `text`: a Hershey stroke is a polyline
// sampled from curves. This drops repeated points, detects closed loops (last point = first) and
// subdivides each segment that lies on a curve into `segments` pieces along a uniform Catmull-Rom
// spline through its neighbours. Corners (turns ≥ 50°) and straight runs between two corners stay
// exact, so stems keep their vertex count and only bowls gain points. segments = 1 = raw data.

const CORNER_COS = Math.cos((50 * Math.PI) / 180);
const EPS = 1e-9;

export interface SmoothStroke {
  /** x0, y0, x1, y1, …; a closed loop does not repeat its first point. */
  readonly pts: number[];
  readonly closed: boolean;
}

/** Turn at point b between a→b and b→c: true if it is a corner. */
function corner(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = cx - bx;
  const vy = cy - by;
  const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
  return d < EPS || (ux * vx + uy * vy) / d < CORNER_COS;
}

export function smoothStroke(src: readonly number[], segments: number): SmoothStroke {
  const p: number[] = [];
  for (let i = 0; i + 1 < src.length; i += 2) {
    const x = src[i] ?? 0;
    const y = src[i + 1] ?? 0;
    const n = p.length;
    if (n >= 2 && Math.abs(x - (p[n - 2] ?? 0)) < EPS && Math.abs(y - (p[n - 1] ?? 0)) < EPS)
      continue;
    p.push(x, y);
  }
  let count = p.length / 2;
  const closed =
    count >= 4 &&
    Math.abs((p[0] ?? 0) - (p[p.length - 2] ?? 0)) < EPS &&
    Math.abs((p[1] ?? 0) - (p[p.length - 1] ?? 0)) < EPS;
  if (closed) {
    p.length -= 2;
    count--;
  }
  if (segments <= 1 || count < 3) return { pts: p, closed };
  const at = (i: number, k: 0 | 1): number => {
    const j = closed ? ((i % count) + count) % count : i;
    return p[2 * j + k] ?? 0;
  };
  const isCorner = new Array<boolean>(count);
  for (let i = 0; i < count; i++)
    isCorner[i] =
      !closed && (i === 0 || i === count - 1)
        ? true
        : corner(at(i - 1, 0), at(i - 1, 1), at(i, 0), at(i, 1), at(i + 1, 0), at(i + 1, 1));
  const out: number[] = [];
  const last = closed ? count : count - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % count;
    const x1 = at(i, 0);
    const y1 = at(i, 1);
    const x2 = at(i + 1, 0);
    const y2 = at(i + 1, 1);
    out.push(x1, y1);
    if (isCorner[i] && isCorner[j]) continue;
    // Phantom neighbours at corners: reflect, so the spline leaves the corner along the segment.
    const x0 = isCorner[i] ? 2 * x1 - x2 : at(i - 1, 0);
    const y0 = isCorner[i] ? 2 * y1 - y2 : at(i - 1, 1);
    const x3 = isCorner[j] ? 2 * x2 - x1 : at(i + 2, 0);
    const y3 = isCorner[j] ? 2 * y2 - y1 : at(i + 2, 1);
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        0.5 *
          (2 * x1 +
            (x2 - x0) * t +
            (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 +
            (3 * x1 - x0 - 3 * x2 + x3) * t3),
        0.5 *
          (2 * y1 +
            (y2 - y0) * t +
            (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 +
            (3 * y1 - y0 - 3 * y2 + y3) * t3),
      );
    }
  }
  if (!closed) out.push(at(count - 1, 0), at(count - 1, 1));
  return { pts: out, closed };
}
