// One pen stroke → flat pieces, the way a plotter pen of width 2·half would ink it. Gentle turns
// share a mitred rung (one continuous ribbon); a turn ≥ 50°, or one so tight the inner miter
// would fold back over a neighbouring segment, breaks the ribbon and fills the joint with a round
// disc ('round') or a bevel ('square'). Open ends get round or square caps; a closed loop smaller
// than the pen (Hershey's dots) becomes one filled disc. Never folds, so every face stays CCW.

import { arc, fan, type Piece, ribbon } from './text-pieces.ts';
import type { SmoothStroke } from './text-smooth.ts';

export interface StrokeStyle {
  /** Half the stroke width, same units as the points. */
  readonly half: number;
  readonly cap: 'round' | 'square';
  /** Arc steps of a round cap (a round join's disc gets twice as many). */
  readonly capSteps: number;
}

const MITER_COS = Math.cos((50 * Math.PI) / 180);

function dot(x: number, y: number, rad: number, st: StrokeStyle, out: Piece[]): void {
  if (st.cap === 'square') {
    const r = [x - rad, y - rad, x + rad, y - rad, x + rad, y + rad, x - rad, y + rad];
    out.push(fan(x, y, r, true));
    return;
  }
  const ring = arc(x, y, rad, 0, 2 * Math.PI, 2 * st.capSteps);
  ring.length -= 2;
  out.push(fan(x, y, ring, true));
}

function cap(x: number, y: number, ox: number, oy: number, st: StrokeStyle, out: Piece[]): void {
  const h = st.half;
  if (st.cap === 'square') {
    const ring = [x + h * oy, y - h * ox, x + h * (oy + ox), y + h * (oy - ox)];
    ring.push(x + h * (ox - oy), y + h * (ox + oy), x - h * oy, y + h * ox);
    out.push(fan(x, y, ring, false));
    return;
  }
  const a = Math.atan2(oy, ox);
  out.push(fan(x, y, arc(x, y, h, a - Math.PI / 2, a + Math.PI / 2, st.capSteps), false));
}

export function strokePieces(s: SmoothStroke, st: StrokeStyle, out: Piece[]): void {
  const p = s.pts;
  const n = p.length / 2;
  const h = st.half;
  const px = (i: number): number => p[2 * (((i % n) + n) % n)] ?? 0;
  const py = (i: number): number => p[2 * (((i % n) + n) % n) + 1] ?? 0;
  if (n === 0) return;
  if (n === 1) {
    dot(px(0), py(0), h, st, out);
    return;
  }
  if (s.closed) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i++) {
      cx += px(i) / n;
      cy += py(i) / n;
    }
    let rad = 0;
    for (let i = 0; i < n; i++) rad = Math.max(rad, Math.hypot(px(i) - cx, py(i) - cy));
    if (rad <= 1.5 * h) {
      dot(cx, cy, rad + h, st, out);
      return;
    }
  }
  const m = s.closed ? n : n - 1;
  // Segment i runs from point i to point i + 1: unit direction and length.
  const dx = new Float64Array(m);
  const dy = new Float64Array(m);
  const len = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    const ex = px(i + 1) - px(i);
    const ey = py(i + 1) - py(i);
    len[i] = Math.hypot(ex, ey);
    dx[i] = ex / (len[i] || 1);
    dy[i] = ey / (len[i] || 1);
  }
  const seg = (i: number): number => ((i % m) + m) % m;
  const brk = new Uint8Array(n);
  const breaks: number[] = [];
  for (let i = s.closed ? 0 : 1; i < (s.closed ? n : n - 1); i++) {
    const a = seg(i - 1);
    const b = seg(i);
    const c = (dx[a] ?? 0) * (dx[b] ?? 0) + (dy[a] ?? 0) * (dy[b] ?? 0);
    const tanHalf = Math.sqrt(Math.max(0, (1 - c) / (1 + c)));
    if (c < MITER_COS || h * tanHalf > 0.5 * Math.min(len[a] ?? 0, len[b] ?? 0)) {
      brk[i] = 1;
      breaks.push(i);
    }
  }
  /** Right/left offset of point i: mitred unless it ends a run (then square to segment `own`). */
  const offset = (i: number, own: number | null, r: number[], l: number[]): void => {
    let nx: number;
    let ny: number;
    if (own !== null) {
      nx = -(dy[seg(own)] ?? 0) * h;
      ny = (dx[seg(own)] ?? 0) * h;
    } else {
      const a = seg(i - 1);
      const b = seg(i);
      const mx = -(dy[a] ?? 0) - (dy[b] ?? 0);
      const my = (dx[a] ?? 0) + (dx[b] ?? 0);
      const ml = Math.hypot(mx, my) || 1;
      const k = h / ((mx / ml) * -(dy[a] ?? 0) + (my / ml) * (dx[a] ?? 0));
      nx = (mx / ml) * k;
      ny = (my / ml) * k;
    }
    r.push(px(i) - nx, py(i) - ny);
    l.push(px(i) + nx, py(i) + ny);
  };
  const run = (a: number, b: number): void => {
    const r: number[] = [];
    const l: number[] = [];
    offset(a, a, r, l);
    for (let i = a + 1; i < b; i++) offset(i, null, r, l);
    offset(b, b - 1, r, l);
    out.push(ribbon(r, l, false));
  };
  if (s.closed && breaks.length === 0) {
    const r: number[] = [];
    const l: number[] = [];
    for (let i = 0; i < n; i++) offset(i, null, r, l);
    out.push(ribbon(r, l, true));
    return;
  }
  if (s.closed)
    breaks.forEach((a, k) => {
      run(a, k + 1 < breaks.length ? (breaks[k + 1] ?? a) : (breaks[0] ?? 0) + n);
    });
  else {
    let a = 0;
    for (let i = 1; i < n; i++)
      if (i === n - 1 || brk[i]) {
        run(a, i);
        a = i;
      }
    cap(px(0), py(0), -(dx[0] ?? 0), -(dy[0] ?? 0), st, out);
    cap(px(n - 1), py(n - 1), dx[m - 1] ?? 0, dy[m - 1] ?? 0, st, out);
  }
  for (const i of breaks) join(px(i), py(i), seg(i - 1), seg(i), dx, dy, st, out);
}

function join(
  x: number,
  y: number,
  a: number,
  b: number,
  dx: Float64Array,
  dy: Float64Array,
  st: StrokeStyle,
  out: Piece[],
): void {
  const h = st.half;
  if (st.cap === 'round') {
    dot(x, y, h, st, out);
    return;
  }
  const turn = (dx[a] ?? 0) * (dy[b] ?? 0) - (dy[a] ?? 0) * (dx[b] ?? 0);
  if (Math.abs(turn) < 1e-9) return;
  const side = turn > 0 ? -h : h;
  const ax = x - (dy[a] ?? 0) * side;
  const ay = y + (dx[a] ?? 0) * side;
  const bx = x - (dy[b] ?? 0) * side;
  const by = y + (dx[b] ?? 0) * side;
  const cr = (ax - x) * (by - y) - (ay - y) * (bx - x);
  out.push(fan(x, y, cr > 0 ? [ax, ay, bx, by] : [bx, by, ax, ay], false));
}
