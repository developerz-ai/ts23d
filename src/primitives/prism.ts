// Extrude a 2D profile into a solid: the workhorse for sloped armour, hull side profiles, gables,
// fins, wings in plan. The profile lives in a named plane and extrudes along the remaining axis.
//   plane 'xz' (side profile, extrude along Y) · 'xy' (plan, extrude up Z) · 'yz' (front, along X)

import { type Mesh, MeshBuilder, normalize, type Vec2, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { colorOf, positive, profileOf } from './check.ts';
import { faceBand } from './strip-uv.ts';
import { triangulate } from './triangulate.ts';

export interface PrismOptions {
  readonly profile: readonly Vec2[];
  readonly depth: number;
  readonly plane?: 'xz' | 'xy' | 'yz';
  /** Default true: the extrusion straddles the plane (±depth/2). `false` starts it at the plane. */
  readonly centred?: boolean;
  readonly color: Vec3;
  readonly strip?: StripId;
  readonly caps?: boolean;
}

const lift = (plane: 'xz' | 'xy' | 'yz', p: Vec2, d: number): Vec3 =>
  plane === 'xz' ? [p[0], d, p[1]] : plane === 'xy' ? [p[0], p[1], d] : [d, p[0], p[1]];

const KEYS: Record<keyof PrismOptions, true> = {
  profile: true,
  depth: true,
  plane: true,
  centred: true,
  color: true,
  strip: true,
  caps: true,
};

export function prism(o: PrismOptions): Mesh {
  colorOf('prism', o, KEYS);
  positive('prism depth', o.depth, 'depth: 0.5');
  profileOf('prism profile', o.profile, 3);
  const plane = o.plane ?? 'xy';
  const d0 = o.centred === false ? 0 : -o.depth / 2;
  const d1 = d0 + o.depth;
  const rect = stripRect(o.strip ?? 'plain');
  // V is one band per metre, laid out per face so it never wraps inside one (`faceBand`).
  const uv = (u: number, frac: number): Vec2 => [
    rect.u0 + (u / rect.metres) * (rect.u1 - rect.u0),
    rect.v0 + frac * (rect.v1 - rect.v0),
  ];
  const side = faceBand([0, o.depth]);
  const b = new MeshBuilder();
  const n = o.profile.length;
  // Sides: one flat quad per edge, outward normal regardless of winding.
  const sign =
    o.profile.reduce((s, a, i) => {
      const c = o.profile[(i + 1) % n] ?? a;
      return s + a[0] * c[1] - c[0] * a[1];
    }, 0) > 0
      ? 1
      : -1;
  // The extrusion axis flips handedness for 'xz' (Y = Z × X), so outward flips with it.
  const hand = plane === 'xz' ? -1 : 1;
  let run = 0;
  for (let i = 0; i < n; i++) {
    const a = o.profile[i] ?? [0, 0];
    const c = o.profile[(i + 1) % n] ?? a;
    const e: Vec2 = [c[0] - a[0], c[1] - a[1]];
    const len = Math.hypot(e[0], e[1]);
    if (len < 1e-9) continue;
    const n2: Vec2 = [(e[1] / len) * sign, (-e[0] / len) * sign];
    const nrm = normalize(lift(plane, n2, 0));
    const p = [lift(plane, a, d0), lift(plane, c, d0), lift(plane, c, d1), lift(plane, a, d1)];
    const ids = p.map((q, k) =>
      b.vertex({
        p: q,
        n: nrm,
        uv: uv(run + (k === 1 || k === 2 ? len : 0), side(k >= 2 ? o.depth : 0)),
        color: o.color,
      }),
    );
    const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = ids;
    if (sign * hand > 0) b.quad(i0, i1, i2, i3);
    else b.quad(i0, i3, i2, i1);
    run += len;
  }
  if (o.caps !== false) {
    const tris = triangulate(o.profile);
    const cap = faceBand(o.profile.map((q) => q[1]));
    for (const [d, s] of [
      [d0, -1],
      [d1, 1],
    ] as const) {
      const nrm = normalize(lift(plane, [0, 0], s));
      const ids = o.profile.map((q) =>
        b.vertex({ p: lift(plane, q, d), n: nrm, uv: uv(q[0], cap(q[1])), color: o.color }),
      );
      for (const [x, y, z] of tris) {
        const [a = 0, c = 0, e = 0] = [ids[x], ids[y], ids[z]];
        if (s * hand > 0) b.tri(a, c, e);
        else b.tri(a, e, c);
      }
    }
  }
  return b.build();
}
