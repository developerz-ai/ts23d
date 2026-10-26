// Sweep a closed 2D section along a 3D polyline: branches, trunks, roots, pipes, cables, handrails.
// SMOOTH normals (a swept tube reads as round; caps are flat). Parallel-transport frames, so no
// twist flip. Positions are absolute: the path is in the caller's space (no `at`). UVs: U runs
// along the path in true metres (the strip's tiling axis, like `planar`/`tiled`); V goes once
// around the section inside the strip's band. Triangles = 2·S·(P−1) + S per cap (S section
// points, P path points).

import { type Mesh, MeshBuilder, Ts23dError, type Vec2, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { arcLengths, transportFrames } from './transport.ts';

export interface SweepOptions {
  /** Closed section in the frame's (normal, binormal) plane, either winding; or a circle. */
  readonly section: readonly Vec2[] | { readonly radius: number; readonly segments: number };
  readonly path: readonly Vec3[];
  /** Section scale per path point (taper). Default 1 everywhere. */
  readonly scale?: readonly number[];
  /** Total section rotation from first to last point, degrees, spread by arc length. */
  readonly twist?: number;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Close the ends with fans about the path point: both, or just one. */
  readonly caps?: boolean | 'start' | 'end';
}

interface Section {
  readonly pts: readonly Vec2[];
  /** Outward 2D vertex normals. */
  readonly nrm: readonly Vec2[];
}

function section(s: SweepOptions['section']): Section {
  if (!Array.isArray(s)) {
    const c = s as { radius: number; segments: number };
    if (c.segments < 3 || !(c.radius > 0)) {
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `sweep circle section has radius ${c.radius} and ${c.segments} segments`,
        fix: 'use radius > 0 and segments >= 3 (pick segments from ctx.lod: e.g. 8 / 5 / 3)',
      });
    }
    const nrm: Vec2[] = [];
    for (let k = 0; k < c.segments; k++) {
      const a = (k / c.segments) * Math.PI * 2;
      nrm.push([Math.cos(a), Math.sin(a)]);
    }
    return { pts: nrm.map(([x, y]) => [x * c.radius, y * c.radius]), nrm };
  }
  const poly = s as readonly Vec2[];
  if (poly.length < 3) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `sweep section has ${poly.length} point(s)`,
      fix: 'pass a closed polygon of at least 3 points, or { radius, segments }',
    });
  }
  const area = poly.reduce((a, p, i) => {
    const q = poly[(i + 1) % poly.length] ?? p;
    return a + p[0] * q[1] - q[0] * p[1];
  }, 0);
  const pts = area < 0 ? [...poly].reverse() : poly;
  const nrm = pts.map((p, i): Vec2 => {
    const a = pts[(i + pts.length - 1) % pts.length] ?? p;
    const b = pts[(i + 1) % pts.length] ?? p;
    const e1 = Math.hypot(p[0] - a[0], p[1] - a[1]) || 1;
    const e2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const x = (p[1] - a[1]) / e1 + (b[1] - p[1]) / e2;
    const y = -(p[0] - a[0]) / e1 - (b[0] - p[0]) / e2;
    const l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  });
  return { pts, nrm };
}

export function sweep(o: SweepOptions): Mesh {
  const arc = arcLengths(o.path);
  const frames = transportFrames(o.path);
  const P = o.path.length;
  if (o.scale && o.scale.length !== P) {
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `sweep has ${P} path points but ${o.scale.length} scales`,
      fix: 'pass exactly one scale per path point (or omit scale for a constant section)',
    });
  }
  const sec = section(o.section);
  const S = sec.pts.length;
  const total = arc[P - 1] ?? 1;
  const rect = stripRect(o.strip ?? 'plain');
  const du = (rect.u1 - rect.u0) / rect.metres;
  const twist = ((o.twist ?? 0) * Math.PI) / 180;
  const b = new MeshBuilder();
  /** Rim positions per ring (S each), kept for the caps. */
  const rim = new Float64Array(P * S * 3);
  for (let i = 0; i < P; i++) {
    const c = o.path[i] ?? [0, 0, 0];
    const { t, n, b: bn } = frames[i] ?? { t: [0, 0, 1], n: [1, 0, 0], b: [0, 1, 0] };
    const k = o.scale?.[i] ?? 1;
    // Taper slope dk/ds tilts the smooth normal back along the tangent (a cone, not a cylinder).
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(P - 1, i + 1);
    const slope =
      ((o.scale?.[i1] ?? 1) - (o.scale?.[i0] ?? 1)) / ((arc[i1] ?? 0) - (arc[i0] ?? 0) || 1);
    const rot = (twist * (arc[i] ?? 0)) / total;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const u = rect.u0 + (arc[i] ?? 0) * du;
    for (let j = 0; j <= S; j++) {
      const [px, py] = sec.pts[j % S] ?? [0, 0];
      const [nx, ny] = sec.nrm[j % S] ?? [1, 0];
      const x = (px * cr - py * sr) * k;
      const y = (px * sr + py * cr) * k;
      const mx = nx * cr - ny * sr;
      const my = nx * sr + ny * cr;
      const back = -slope * (px * nx + py * ny);
      const qx = mx * n[0] + my * bn[0] + back * t[0];
      const qy = mx * n[1] + my * bn[1] + back * t[1];
      const qz = mx * n[2] + my * bn[2] + back * t[2];
      const ql = Math.hypot(qx, qy, qz) || 1;
      const p: Vec3 = [
        c[0] + x * n[0] + y * bn[0],
        c[1] + x * n[1] + y * bn[1],
        c[2] + x * n[2] + y * bn[2],
      ];
      if (j < S) rim.set(p, (i * S + j) * 3);
      b.vertex({
        p,
        n: [qx / ql, qy / ql, qz / ql],
        uv: [u, rect.v0 + (j / S) * (rect.v1 - rect.v0)],
        color: o.color,
      });
    }
  }
  for (let i = 0; i + 1 < P; i++) {
    const r0 = i * (S + 1);
    const r1 = r0 + S + 1;
    for (let j = 0; j < S; j++) b.quad(r0 + j, r0 + j + 1, r1 + j + 1, r1 + j);
  }
  const caps = o.caps === true ? ['start', 'end'] : o.caps ? [o.caps] : [];
  for (const end of caps) {
    const i = end === 'start' ? 0 : P - 1;
    const f = frames[i]?.t ?? [0, 0, 1];
    const sign = end === 'start' ? -1 : 1;
    const nn: Vec3 = [f[0] * sign, f[1] * sign, f[2] * sign];
    const centre = b.vertex({
      p: o.path[i] ?? [0, 0, 0],
      n: nn,
      uv: [rect.u0, rect.v0],
      color: o.color,
    });
    const first = centre + 1;
    for (let j = 0; j < S; j++) {
      const q = (i * S + j) * 3;
      const p: Vec3 = [rim[q] ?? 0, rim[q + 1] ?? 0, rim[q + 2] ?? 0];
      b.vertex({ p, n: nn, uv: [rect.u0, rect.v1], color: o.color });
    }
    for (let j = 0; j < S; j++) {
      const a = first + j;
      const c = first + ((j + 1) % S);
      if (sign > 0) b.tri(centre, a, c);
      else b.tri(centre, c, a);
    }
  }
  return b.build();
}
