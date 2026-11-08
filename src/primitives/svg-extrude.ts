// Draw → solid: an SVG drawing extruded to a closed, outward-wound mesh. Fill is even-odd (holes
// by nesting), caps are ear-clipped with hole bridges, side walls run around every loop, and an
// optional `bevel` adds a 45° chamfer ring front and back (the mid-poly hard-surface look; flat
// chamfer faces suit a face-weighted-normal pass). Walls are smooth across gentle outline turns
// and split at corners sharper than `creaseDeg`, so a flattened circle shades round.
//   view 'front': drawing in the YZ plane, extruded along X, centred on x = 0
//   view 'side':  drawing in the XZ plane (+X to the right), extruded along Y, centred on y = 0
//   view 'top':   drawing in the XY plane, extruded up Z from z = 0
// The drawing's origin (svg-doc.ts, default paper bottom centre) lands on `at`.
// UVs: true metres on the strip; walls run U along the outline, V across the depth.

import { type Mesh, MeshBuilder, type Vec2, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { invalid } from './check.ts';
import { mirroredV, stripU, stripVMetres } from './strip-uv.ts';
import { type SvgOptions, svgShape } from './svg-doc.ts';
import { fillRegion, type Region, regions } from './svg-triangulate.ts';

export type SvgView = 'front' | 'side' | 'top';

export interface ExtrudeSvgOptions extends SvgOptions {
  /** Thickness in metres along the view axis. */
  readonly depth: number;
  /** Chamfer width in metres (0 = sharp). Keep it below half the thinnest stroke. */
  readonly bevel?: number;
  readonly view?: SvgView;
  readonly at?: Vec3;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Outline turns sharper than this (degrees) get split normals. Default 35. */
  readonly creaseDeg?: number;
}

/** Local (u, v, w) → world, right-handed for every view (u × v = w). */
const toWorld = (view: SvgView, u: number, v: number, w: number): Vec3 =>
  view === 'front' ? [w, u, v] : view === 'side' ? [u, -w, v] : [u, v, w];

/** Offset a loop (material on its left) inward by d, mitred, the mitre capped at 3 d. */
export function inset(loop: readonly Vec2[], d: number): Vec2[] {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n] ?? p;
    const b = loop[(i + 1) % n] ?? p;
    const l0 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const l1 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const n0: Vec2 = [-(p[1] - a[1]) / l0, (p[0] - a[0]) / l0];
    const n1: Vec2 = [-(b[1] - p[1]) / l1, (b[0] - p[0]) / l1];
    const k = Math.min(3, 1 / Math.max(1e-6, (1 + n0[0] * n1[0] + n0[1] * n1[1]) / 2));
    return [p[0] + ((n0[0] + n1[0]) / 2) * d * k, p[1] + ((n0[1] + n1[1]) / 2) * d * k];
  });
}

export function extrudeSvg(svg: string, o: ExtrudeSvgOptions): Mesh {
  if (!(o.depth > 0))
    invalid(`extrudeSvg depth is ${o.depth}`, 'use a thickness > 0 m (e.g. depth: 0.05)');
  const bevel = o.bevel ?? 0;
  if (!(bevel >= 0) || bevel >= o.depth / 2)
    invalid(`extrudeSvg bevel ${bevel} m vs depth ${o.depth} m`, 'use 0 ≤ bevel < depth / 2');
  const view = o.view ?? 'side';
  const shape = svgShape(svg, o);
  const regs = regions(shape.contours.map((c) => c.points));
  if (regs.length === 0)
    invalid(
      'extrudeSvg drawing encloses no area',
      'draw closed shapes (end paths with Z) with area',
    );
  const [w0, w1] = view === 'top' ? [0, o.depth] : [-o.depth / 2, o.depth / 2];
  const [ax, ay, az] = o.at ?? [0, 0, 0];
  const strip = o.strip ?? 'plain';
  const rect = stripRect(strip);
  const vm = stripVMetres(strip);
  const crease = Math.cos(((o.creaseDeg ?? 35) * Math.PI) / 180);
  const b = new MeshBuilder();
  const put = (u: number, v: number, w: number, n: Vec3, uv: Vec2): number => {
    const p = toWorld(view, u, v, w);
    return b.vertex({
      p: [p[0] + ax, p[1] + ay, p[2] + az],
      n: toWorld(view, n[0], n[1], n[2]),
      uv,
      color: o.color,
    });
  };
  const cap = (r: Region, w: number, up: boolean): void => {
    const { pts, tris } = fillRegion(r);
    const ids = pts.map((p) =>
      put(p[0], p[1], w, [0, 0, up ? 1 : -1], [stripU(rect, p[0]), mirroredV(rect, p[1], vm)]),
    );
    for (const [i, j, k] of tris) {
      const [x = 0, y = 0, z = 0] = [ids[i], ids[j], ids[k]];
      if (up) b.tri(x, y, z);
      else b.tri(x, z, y);
    }
  };
  /** Quads between ring A (at wa) and ring B (at wb > wa side), smooth across gentle turns. */
  const band = (
    A: readonly Vec2[],
    wa: number,
    B: readonly Vec2[],
    wb: number,
    vStart: number,
  ): void => {
    const n = A.length;
    const fn: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const a0 = A[i] ?? [0, 0];
      const a1 = A[(i + 1) % n] ?? a0;
      const b0 = B[i] ?? a0;
      const e: Vec3 = [a1[0] - a0[0], a1[1] - a0[1], 0];
      const f: Vec3 = [b0[0] - a0[0], b0[1] - a0[1], wb - wa];
      const c: Vec3 = [
        e[1] * f[2] - e[2] * f[1],
        e[2] * f[0] - e[0] * f[2],
        e[0] * f[1] - e[1] * f[0],
      ];
      const l = Math.hypot(c[0], c[1], c[2]) || 1;
      fn.push([c[0] / l, c[1] / l, c[2] / l]);
    }
    const smooth = (i: number): boolean => {
      const p = fn[(i + n - 1) % n] ?? [0, 0, 1];
      const q = fn[i] ?? p;
      return p[0] * q[0] + p[1] * q[1] + p[2] * q[2] > crease;
    };
    const avg = (i: number): Vec3 => {
      const p = fn[(i + n - 1) % n] ?? [0, 0, 1];
      const q = fn[i] ?? p;
      const s: Vec3 = [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      return [s[0] / l, s[1] / l, s[2] / l];
    };
    const vSpan = Math.hypot(
      wb - wa,
      (B[0]?.[0] ?? 0) - (A[0]?.[0] ?? 0),
      (B[0]?.[1] ?? 0) - (A[0]?.[1] ?? 0),
    );
    let run = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = A[i] ?? [0, 0];
      const a1 = A[j] ?? a0;
      const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
      const own = fn[i] ?? [0, 0, 1];
      const n0 = smooth(i) ? avg(i) : own;
      const n1 = smooth(j) ? avg(j) : own;
      const [u0, u1] = [stripU(rect, run), stripU(rect, run + len)];
      const [v0, v1] = [mirroredV(rect, vStart, vm), mirroredV(rect, vStart + vSpan, vm)];
      const b0 = B[i] ?? a0;
      const b1 = B[j] ?? a1;
      b.quad(
        put(a0[0], a0[1], wa, n0, [u0, v0]),
        put(a1[0], a1[1], wa, n1, [u1, v0]),
        put(b1[0], b1[1], wb, n1, [u1, v1]),
        put(b0[0], b0[1], wb, n0, [u0, v1]),
      );
      run += len;
    }
  };
  for (const r of regs) {
    const loops = [r.outer, ...r.holes];
    const inner = loops.map((l) => (bevel > 0 ? inset(l, bevel) : [...l]));
    const capRegion: Region = { outer: inner[0] ?? [], holes: inner.slice(1) };
    cap(capRegion, w1, true);
    cap(capRegion, w0, false);
    loops.forEach((l, k) => {
      const li = inner[k] ?? l;
      if (bevel > 0) band(li, w0, l, w0 + bevel, 0);
      band(l, w0 + bevel, l, w1 - bevel, bevel);
      if (bevel > 0) band(l, w1 - bevel, li, w1, o.depth - bevel);
    });
  }
  return b.build();
}
