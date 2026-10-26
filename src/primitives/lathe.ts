// Surface of revolution around local Z: boilers, wheels, domes, spires, chimneys, tanks.
// `segments` is the knob LOD turns down; profiles are (radius, z) pairs bottom→top.
// Rings start at -90° so a vertex always sits at the contact point: a coarse LOD2 wheel still
// touches its track (the floating-parts gate caught exactly that).

import { type Mesh, MeshBuilder, type Vec2, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

export interface LatheOptions {
  readonly profile: readonly Vec2[];
  readonly segments: number;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Rotate the lathe axis from Z onto X or Y (wheels spin about Y). */
  readonly axis?: 'x' | 'y' | 'z';
  readonly at?: Vec3;
  /** Close the ends with fans (solid cylinders/wheels). */
  readonly caps?: boolean;
}

const orient = (p: Vec3, axis: 'x' | 'y' | 'z'): Vec3 =>
  axis === 'z' ? p : axis === 'y' ? [p[0], p[2], p[1]] : [p[2], p[1], p[0]];

export function lathe(o: LatheOptions): Mesh {
  const axis = o.axis ?? 'z';
  const [ox, oy, oz] = o.at ?? [0, 0, 0];
  const rect = stripRect(o.strip ?? 'plain');
  const b = new MeshBuilder();
  const ring: number[][] = [];
  const put = (p: Vec3, n: Vec3, u: number, v: number): number => {
    const q = orient(p, axis);
    return b.vertex({
      p: [q[0] + ox, q[1] + oy, q[2] + oz],
      n: orient(n, axis),
      uv: [rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0)],
      color: o.color,
    });
  };
  o.profile.forEach(([r, z], i) => {
    const prev = o.profile[i - 1] ?? o.profile[i] ?? [r, z];
    const next = o.profile[i + 1] ?? o.profile[i] ?? [r, z];
    // Profile-tangent normal: perpendicular to the neighbour chord in (r, z).
    const dr = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dr, dz) || 1;
    const row: number[] = [];
    for (let s = 0; s <= o.segments; s++) {
      const t = (s / o.segments) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      row.push(
        put(
          [r * c, r * sn, z],
          [(dz / len) * c, (dz / len) * sn, -dr / len],
          s / o.segments,
          i / Math.max(1, o.profile.length - 1),
        ),
      );
    }
    ring.push(row);
  });
  for (let i = 0; i + 1 < ring.length; i++) {
    for (let s = 0; s < o.segments; s++) {
      const a = ring[i]?.[s] ?? 0;
      const bb = ring[i]?.[s + 1] ?? 0;
      const c = ring[i + 1]?.[s + 1] ?? 0;
      const d = ring[i + 1]?.[s] ?? 0;
      b.quad(a, bb, c, d);
    }
  }
  if (o.caps) {
    const ends = [
      { pt: o.profile[0], n: -1 },
      { pt: o.profile[o.profile.length - 1], n: 1 },
    ];
    for (const { pt, n } of ends) {
      if (!pt) continue;
      const centre = put([0, 0, pt[1]], [0, 0, n], 0.5, 0.5);
      const rim: number[] = [];
      for (let s = 0; s <= o.segments; s++) {
        const t = (s / o.segments) * Math.PI * 2 - Math.PI / 2;
        rim.push(
          put(
            [pt[0] * Math.cos(t), pt[0] * Math.sin(t), pt[1]],
            [0, 0, n],
            0.5 + Math.cos(t) / 2,
            0.5 + Math.sin(t) / 2,
          ),
        );
      }
      for (let s = 0; s < o.segments; s++) {
        const r0 = rim[s] ?? 0;
        const r1 = rim[s + 1] ?? 0;
        if (n > 0) b.tri(centre, r0, r1);
        else b.tri(centre, r1, r0);
      }
    }
  }
  return b.build();
}

/** Convenience: a capped cylinder, the most common lathe. */
export const cylinder = (
  o: Omit<LatheOptions, 'profile' | 'caps'> & { radius: number; length: number },
): Mesh =>
  lathe({
    ...o,
    profile: [
      [o.radius, -o.length / 2],
      [o.radius, o.length / 2],
    ],
    caps: true,
  });
