// One straight structural member written into a shared MeshBuilder: a 2D section (square tube or
// angle iron) extruded from → to with flat normals. Lattice emits hundreds of these, so there is
// no per-member Mesh or merge; the section and its cap triangulation are computed once.

import type { MeshBuilder, Vec2, Vec3 } from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { stripU, stripV } from './strip-uv.ts';
import { triangulate } from './triangulate.ts';

export type SectionKind = 'square' | 'angle';

export interface Section {
  /** Profile in the member's (x, y) plane, CCW seen from the far end. */
  readonly ring: readonly Vec2[];
  readonly caps: readonly (readonly [number, number, number])[];
  /** Cumulative perimeter run at each ring vertex, as a fraction 0..1 (V across the strip). */
  readonly run: readonly number[];
  /** Side triangles per member (caps add 2 · caps.length). */
  readonly sideTris: number;
}

/** A section of outside width `w`; angle legs are 15% of the width thick. */
export function section(kind: SectionKind, w: number): Section {
  const h = w / 2;
  const t = w * 0.15;
  const ring: Vec2[] =
    kind === 'square'
      ? [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
        ]
      : [
          [-h, -h],
          [h, -h],
          [h, -h + t],
          [-h + t, -h + t],
          [-h + t, h],
          [-h, h],
        ];
  const lens = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length] ?? a;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const total = lens.reduce((s, l) => s + l, 0);
  let acc = 0;
  const run = lens.map((l) => {
    const r = acc / total;
    acc += l;
    return r;
  });
  return { ring, caps: triangulate(ring), run, sideTris: ring.length * 2 };
}

/**
 * Extrude `s` from a to b. `y` is the section's local up (must not be parallel to b − a): put it
 * on the face normal so members lie flush in their truss plane. Caps close both ends.
 */
export function emitMember(
  mb: MeshBuilder,
  s: Section,
  a: Vec3,
  b: Vec3,
  y: Vec3,
  caps: boolean,
  color: Vec3,
  rect: UvRect,
): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
  const w: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  // y ⟂ w (Gram–Schmidt), x = y × w so (x, y, w) is right-handed.
  const k = y[0] * w[0] + y[1] * w[1] + y[2] * w[2];
  const yr: Vec3 = [y[0] - w[0] * k, y[1] - w[1] * k, y[2] - w[2] * k];
  const yl = Math.sqrt(yr[0] * yr[0] + yr[1] * yr[1] + yr[2] * yr[2]);
  const yy: Vec3 = [yr[0] / yl, yr[1] / yl, yr[2] / yl];
  const x: Vec3 = [
    yy[1] * w[2] - yy[2] * w[1],
    yy[2] * w[0] - yy[0] * w[2],
    yy[0] * w[1] - yy[1] * w[0],
  ];
  const at = (p: Vec2, end: Vec3): Vec3 => [
    end[0] + x[0] * p[0] + yy[0] * p[1],
    end[1] + x[1] * p[0] + yy[1] * p[1],
    end[2] + x[2] * p[0] + yy[2] * p[1],
  ];
  const n = s.ring.length;
  const u1 = stripU(rect, len);
  const u0 = stripU(rect, 0);
  for (let i = 0; i < n; i++) {
    const p = s.ring[i] ?? [0, 0];
    const q = s.ring[(i + 1) % n] ?? p;
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const el = Math.hypot(ex, ey);
    // Outward 2D normal of a CCW edge is (ey, −ex).
    const nx = ey / el;
    const ny = -ex / el;
    const nrm: Vec3 = [x[0] * nx + yy[0] * ny, x[1] * nx + yy[1] * ny, x[2] * nx + yy[2] * ny];
    const v0 = stripV(rect, s.run[i] ?? 0);
    const v1 = stripV(rect, i + 1 < n ? (s.run[i + 1] ?? 1) : 1);
    const i0 = mb.vertex({ p: at(p, a), n: nrm, uv: [u0, v0], color });
    const i1 = mb.vertex({ p: at(q, a), n: nrm, uv: [u0, v1], color });
    const i2 = mb.vertex({ p: at(q, b), n: nrm, uv: [u1, v1], color });
    const i3 = mb.vertex({ p: at(p, b), n: nrm, uv: [u1, v0], color });
    mb.quad(i0, i1, i2, i3);
  }
  if (!caps) return;
  for (const [end, sign] of [
    [a, -1],
    [b, 1],
  ] as const) {
    const nrm: Vec3 = [w[0] * sign, w[1] * sign, w[2] * sign];
    const first = mb.vertex({
      p: at(s.ring[0] ?? [0, 0], end),
      n: nrm,
      uv: [u0, stripV(rect, 0)],
      color,
    });
    for (let i = 1; i < n; i++) {
      const p = s.ring[i] ?? [0, 0];
      mb.vertex({ p: at(p, end), n: nrm, uv: [u0, stripV(rect, s.run[i] ?? 0)], color });
    }
    for (const [i, j, l] of s.caps) {
      if (sign > 0) mb.tri(first + i, first + j, first + l);
      else mb.tri(first + i, first + l, first + j);
    }
  }
}
