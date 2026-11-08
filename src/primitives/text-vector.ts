// Vector lettering → Mesh for `text` with a Hershey font: lays out the line (text-vector-layout),
// smooths each stroke to the requested `segments` (text-smooth), inks it with a pen of the given
// weight (text-stroke) and emits the pieces as flush decals lifted 2 mm (depth 0, top face only)
// or raised solids (top + walls along each piece's outline). Flat normals: the face looks along
// along × up, walls along their 2D outline normal. With `surface`, a stroke is cut wherever the
// surface under it steps and each piece sits on the highest surface under any of its points.

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { CAP_UNITS, type VectorFont } from './glyph-hershey.ts';
import { stripU, stripV } from './strip-uv.ts';
import type { Piece } from './text-pieces.ts';
import { type SmoothStroke, smoothStroke } from './text-smooth.ts';
import { strokePieces } from './text-stroke.ts';
import { vectorLayout } from './text-vector-layout.ts';

export interface VectorTextInput {
  readonly origin: Vec3;
  readonly along: Vec3;
  readonly up: Vec3;
  /** Facing normal, along × up. */
  readonly n: Vec3;
  readonly height: number;
  readonly depth: number;
  readonly color: Vec3;
  readonly rect: UvRect;
  readonly font: VectorFont;
  readonly tracking: number;
  readonly kerning: boolean;
  readonly weight: number;
  readonly segments: number;
  readonly cap: 'round' | 'square';
  readonly align?: 'left' | 'centre' | 'right' | undefined;
  readonly surface?: ((u: number, v: number) => number) | undefined;
}

const LIFT = 0.002;

/** Split a stroke where the surface level under its segments (ends + middle) changes. */
function bySurface(
  s: SmoothStroke,
  surface: (u: number, v: number) => number,
): { s: SmoothStroke; level: number }[] {
  const p = s.closed ? [...s.pts, s.pts[0] ?? 0, s.pts[1] ?? 0] : s.pts;
  const level: number[] = [];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    level.push(Math.max(surface(x0, y0), surface(x1, y1), surface((x0 + x1) / 2, (y0 + y1) / 2)));
  }
  const l0 = level[0] ?? surface(p[0] ?? 0, p[1] ?? 0);
  if (level.every((l) => Math.abs(l - l0) < 1e-6)) return [{ s, level: l0 }];
  const out: { s: SmoothStroke; level: number }[] = [];
  let a = 0;
  for (let i = 1; i <= level.length; i++)
    if (i === level.length || Math.abs((level[i] ?? 0) - (level[a] ?? 0)) >= 1e-6) {
      out.push({ s: { pts: p.slice(2 * a, 2 * i + 2), closed: false }, level: level[a] ?? 0 });
      a = i;
    }
  return out;
}

export function vectorText(str: string, o: VectorTextInput): Mesh {
  const unit = o.height / CAP_UNITS;
  const { strokes, width } = vectorLayout(str, o);
  const w = width * unit;
  const start = o.align === 'centre' ? -w / 2 : o.align === 'right' ? -w : 0;
  const style = {
    half: (o.weight * o.height) / 2,
    cap: o.cap,
    capSteps: o.segments + 1,
  };
  const pieces: Piece[] = [];
  /** Surface level under the run each piece came from. */
  const levels: number[] = [];
  for (const src of strokes) {
    const m = src.map((x, k) => (k % 2 === 0 ? start + x * unit : x * unit));
    const smooth = smoothStroke(m, o.segments);
    for (const r of o.surface ? bySurface(smooth, o.surface) : [{ s: smooth, level: 0 }]) {
      strokePieces(r.s, style, pieces);
      while (levels.length < pieces.length) levels.push(r.level);
    }
  }
  const b = new MeshBuilder();
  const { origin, along, up, n } = o;
  const at = (u: number, v: number, h: number): Vec3 => [
    origin[0] + along[0] * u + up[0] * v + n[0] * h,
    origin[1] + along[1] * u + up[1] * v + n[1] * h,
    origin[2] + along[2] * u + up[2] * v + n[2] * h,
  ];
  const vOf = (v: number): number => stripV(o.rect, Math.min(1, Math.max(0, v / o.height)));
  for (let pi = 0; pi < pieces.length; pi++) {
    const pc = pieces[pi] ?? { xy: [], tri: [], walls: [] };
    const xy = pc.xy;
    let s = levels[pi] ?? 0;
    if (o.surface) {
      for (let k = 0; k < xy.length; k += 2) s = Math.max(s, o.surface(xy[k] ?? 0, xy[k + 1] ?? 0));
    }
    const lo = o.depth > 0 ? s : s + LIFT;
    const hi = o.depth > 0 ? s + o.depth : lo;
    const base: number[] = [];
    for (let k = 0; k < xy.length; k += 2) {
      const u = xy[k] ?? 0;
      const v = xy[k + 1] ?? 0;
      base.push(b.vertex({ p: at(u, v, hi), n, uv: [stripU(o.rect, u), vOf(v)], color: o.color }));
    }
    for (let k = 0; k + 2 < pc.tri.length; k += 3)
      b.tri(
        base[pc.tri[k] ?? 0] ?? 0,
        base[pc.tri[k + 1] ?? 0] ?? 0,
        base[pc.tri[k + 2] ?? 0] ?? 0,
      );
    if (o.depth <= 0) continue;
    const dv = vOf(o.depth);
    const v0 = vOf(0);
    for (const chain of pc.walls) {
      let run = 0;
      for (let k = 0; k + 1 < chain.length; k++) {
        const i = chain[k] ?? 0;
        const j = chain[k + 1] ?? 0;
        const [pu = 0, pv = 0, qu = 0, qv = 0] = [
          xy[2 * i],
          xy[2 * i + 1],
          xy[2 * j],
          xy[2 * j + 1],
        ];
        const ex = qu - pu;
        const ey = qv - pv;
        const len = Math.hypot(ex, ey);
        if (len < 1e-9) continue;
        const ox = ey / len;
        const oy = -ex / len;
        const wn: Vec3 = [
          along[0] * ox + up[0] * oy,
          along[1] * ox + up[1] * oy,
          along[2] * ox + up[2] * oy,
        ];
        const u0 = stripU(o.rect, run);
        const u1 = stripU(o.rect, run + len);
        run += len;
        const c = o.color;
        b.quad(
          b.vertex({ p: at(pu, pv, lo), n: wn, uv: [u0, v0], color: c }),
          b.vertex({ p: at(qu, qv, lo), n: wn, uv: [u1, v0], color: c }),
          b.vertex({ p: at(qu, qv, hi), n: wn, uv: [u1, dv], color: c }),
          b.vertex({ p: at(pu, pv, hi), n: wn, uv: [u0, dv], color: c }),
        );
      }
    }
  }
  return b.build();
}
