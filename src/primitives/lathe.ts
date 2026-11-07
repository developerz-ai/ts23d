// Surface of revolution around local Z: boilers, wheels, domes, spires, chimneys, tanks.
// `segments` is the knob LOD turns down; profiles are (radius, z) pairs bottom→top.
// Rings start at -90° so a vertex always sits at the contact point: a coarse LOD2 wheel still
// touches its track (the floating-parts gate caught exactly that).
// Normals: smooth around the axis, split at profile creases; `faceted` gives every segment its own
// flat normal (n-sided tanks, towers, roofs). UVs: `uv: 'metres'` maps the strip at true scale
// (arc length × profile length, staves and shingles at real size); default stretches one strip
// width around and one strip height along the profile.

import { type Mesh, MeshBuilder, type Vec2, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { facets } from './lathe-facets.ts';
import { mirroredV, stripU, stripVMetres } from './strip-uv.ts';

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
  /** Profile turns sharper than this (degrees) get split normals: a hard rim, not a smear
   *  whose averaged normal opposes one band. Default 50. */
  readonly creaseDeg?: number;
  /** 'metres': true-scale strip mapping. Default 'stretch'. */
  readonly uv?: 'stretch' | 'metres';
  /** Flat facets: one normal per segment (an n-sided prism of revolution). */
  readonly faceted?: boolean;
}

// Swapping two coordinates is a reflection (det −1): normals are swapped with the points so they
// still point out, but triangle winding flips, so 'x'/'y' lathes emit their indices reversed.
const orient = (p: Vec3, axis: 'x' | 'y' | 'z'): Vec3 =>
  axis === 'z' ? p : axis === 'y' ? [p[0], p[2], p[1]] : [p[2], p[1], p[0]];

export function lathe(o: LatheOptions): Mesh {
  const axis = o.axis ?? 'z';
  const [ox, oy, oz] = o.at ?? [0, 0, 0];
  const rect = stripRect(o.strip ?? 'plain');
  const b = new MeshBuilder();
  const mirrored = axis !== 'z';
  const tri = (x: number, y: number, z: number): void => {
    if (mirrored) b.tri(x, z, y);
    else b.tri(x, y, z);
  };
  const ring: number[][] = [];
  const put = (p: Vec3, n: Vec3, uv: Vec2): number => {
    const q = orient(p, axis);
    return b.vertex({
      p: [q[0] + ox, q[1] + oy, q[2] + oz],
      n: orient(n, axis),
      uv,
      color: o.color,
    });
  };
  const metres = o.uv === 'metres';
  const vm = stripVMetres(o.strip ?? 'plain');
  const run: number[] = [0];
  for (let i = 1; i < o.profile.length; i++) {
    const [r0 = 0, z0 = 0] = o.profile[i - 1] ?? [];
    const [r1 = 0, z1 = 0] = o.profile[i] ?? [];
    run.push((run[i - 1] ?? 0) + Math.hypot(r1 - r0, z1 - z0));
  }
  /** Side UV at segment s of profile point i (radius r). */
  const sideUv = (s: number, i: number, r: number): Vec2 =>
    metres
      ? [stripU(rect, (Math.PI * 2 * r * s) / o.segments), mirroredV(rect, run[i] ?? 0, vm)]
      : [
          rect.u0 + (s / o.segments) * (rect.u1 - rect.u0),
          rect.v0 + (i / Math.max(1, o.profile.length - 1)) * (rect.v1 - rect.v0),
        ];
  /** Cap UV at direction (cos, sin) · r on a disc (0, 0 = centre). */
  const capUv = (c: number, sn: number, r: number): Vec2 =>
    metres
      ? [stripU(rect, c * r), mirroredV(rect, (sn + 1) * r, vm)]
      : [
          rect.u0 + (0.5 + c / 2) * (rect.u1 - rect.u0),
          rect.v0 + (0.5 + sn / 2) * (rect.v1 - rect.v0),
        ];
  const creaseCos = Math.cos(((o.creaseDeg ?? 50) * Math.PI) / 180);
  /** One ring of segments + 1 vertices at profile point i with normal along chord (dr, dz). */
  const emitRing = (i: number, dr: number, dz: number): number[] => {
    const [r, z] = o.profile[i] ?? [0, 0];
    const len = Math.hypot(dr, dz) || 1;
    const row: number[] = [];
    for (let s = 0; s <= o.segments; s++) {
      const t = (s / o.segments) * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      row.push(
        put([r * c, r * sn, z], [(dz / len) * c, (dz / len) * sn, -dr / len], sideUv(s, i, r)),
      );
    }
    return row;
  };
  // Each profile point gives the ring that ends the band below (`top`) and the one that starts
  // the band above (`ring`); they are the same ring unless the profile creases there.
  const top: number[][] = [];
  if (o.faceted) facets(o, put, tri, sideUv);
  else
    o.profile.forEach(([r, z], i) => {
      const prev = o.profile[i - 1] ?? o.profile[i] ?? [r, z];
      const next = o.profile[i + 1] ?? o.profile[i] ?? [r, z];
      const ir = r - prev[0];
      const iz = z - prev[1];
      const or = next[0] - r;
      const oz = next[1] - z;
      const li = Math.hypot(ir, iz);
      const lo = Math.hypot(or, oz);
      if (li > 1e-12 && lo > 1e-12 && (ir * or + iz * oz) / (li * lo) < creaseCos) {
        top.push(emitRing(i, ir, iz));
        ring.push(emitRing(i, or, oz));
        return;
      }
      // Profile-tangent normal: perpendicular to the neighbour chord in (r, z).
      const row = emitRing(i, next[0] - prev[0], next[1] - prev[1]);
      top.push(row);
      ring.push(row);
    });
  for (let i = 0; i + 1 < ring.length; i++) {
    for (let s = 0; s < o.segments; s++) {
      const a = ring[i]?.[s] ?? 0;
      const bb = ring[i]?.[s + 1] ?? 0;
      const c = top[i + 1]?.[s + 1] ?? 0;
      const d = top[i + 1]?.[s] ?? 0;
      tri(a, bb, c);
      tri(a, c, d);
    }
  }
  if (o.caps) {
    const ends = [
      { pt: o.profile[0], n: -1 },
      { pt: o.profile[o.profile.length - 1], n: 1 },
    ];
    for (const { pt, n } of ends) {
      if (!pt) continue;
      const centre = put([0, 0, pt[1]], [0, 0, n], capUv(0, 0, pt[0]));
      const rim: number[] = [];
      for (let s = 0; s <= o.segments; s++) {
        const t = (s / o.segments) * Math.PI * 2 - Math.PI / 2;
        rim.push(
          put(
            [pt[0] * Math.cos(t), pt[0] * Math.sin(t), pt[1]],
            [0, 0, n],
            capUv(Math.cos(t), Math.sin(t), pt[0]),
          ),
        );
      }
      for (let s = 0; s < o.segments; s++) {
        const r0 = rim[s] ?? 0;
        const r1 = rim[s + 1] ?? 0;
        if (n > 0) tri(centre, r0, r1);
        else tri(centre, r1, r0);
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
