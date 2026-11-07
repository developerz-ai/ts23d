// A flat quad tiling one trim strip at TRUE SCALE: walls, roofs, decks, floors. Flat normal u × v
// (front = the side u × v points to, CCW). U runs along `u` in metres (the sampler repeats it); V
// runs up `v` and is cut into one band per `vMetres`, so brick courses keep their real height on a
// 3 m wall. `uOffset`/`vOffset` phase the pattern so adjacent faces line up.
//   triangles = 2 · segments · bands · (doubleSided ? 2 : 1),  bands = ⌈|v| / vMetres⌉ at offset 0

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { count, positive, spanOf } from './check.ts';
import { stripU, stripV, stripVMetres } from './strip-uv.ts';

export interface TiledOptions {
  /** One corner of the face. */
  readonly origin: Vec3;
  /** Edge along the strip (texture U), metres. */
  readonly u: Vec3;
  /** The other edge, texture "up" (V), metres. */
  readonly v: Vec3;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Columns along `u` (vertex density for grime/bending); the LOD knob. Default 1. */
  readonly segments?: number;
  /** Metres the pattern is shifted along U / V (continue a course round a corner). */
  readonly uOffset?: number;
  readonly vOffset?: number;
  /** World metres one strip band spans along V. Default: the house sheet's `scaleMetres`.
   *  Raise it to stretch the strip (fewer bands, fewer triangles on a far LOD). */
  readonly vMetres?: number;
  readonly doubleSided?: boolean;
}

export function tiled(o: TiledOptions): Mesh {
  const { lu, lv, n } = spanOf('tiled', o.origin, o.u, o.v);
  const strip = o.strip ?? 'plain';
  const segs = count('tiled segments', o.segments ?? 1, 1, 4096);
  const vm = positive('tiled vMetres', o.vMetres ?? stripVMetres(strip), 'e.g. 0.45 for brick');
  const rect = stripRect(strip);
  const uOff = o.uOffset ?? 0;
  const b = new MeshBuilder();
  const sides = o.doubleSided ? [1, -1] : [1];
  let t = 0;
  while (t < lv - 1e-9) {
    let local = (o.vOffset ?? 0) + t;
    local -= Math.floor(local / vm) * vm;
    if (vm - local < 1e-9) local = 0;
    const step = Math.min(lv - t, vm - local);
    const fv0 = local / vm;
    const fv1 = (local + step) / vm;
    for (const side of sides) {
      const nn: Vec3 = [n[0] * side, n[1] * side, n[2] * side];
      const first = row(b, o, nn, rect, uOff, lu, segs, t / lv, stripV(rect, fv0));
      row(b, o, nn, rect, uOff, lu, segs, (t + step) / lv, stripV(rect, fv1));
      for (let j = 0; j < segs; j++) {
        const a = first + j;
        const c = first + segs + 1 + j;
        if (side > 0) b.quad(a, a + 1, c + 1, c);
        else b.quad(a, c, c + 1, a + 1);
      }
    }
    t += step;
  }
  return b.build();
}

/** One row of segs + 1 vertices at fraction `fv` up the face; returns the first index. */
function row(
  b: MeshBuilder,
  o: TiledOptions,
  n: Vec3,
  rect: ReturnType<typeof stripRect>,
  uOff: number,
  lu: number,
  segs: number,
  fv: number,
  v: number,
): number {
  let first = -1;
  for (let j = 0; j <= segs; j++) {
    const fu = j / segs;
    const id = b.vertex({
      p: [
        o.origin[0] + o.u[0] * fu + o.v[0] * fv,
        o.origin[1] + o.u[1] * fu + o.v[1] * fv,
        o.origin[2] + o.u[2] * fu + o.v[2] * fv,
      ],
      n,
      uv: [stripU(rect, uOff + lu * fu), v],
      color: o.color,
    });
    if (first < 0) first = id;
  }
  return first;
}
