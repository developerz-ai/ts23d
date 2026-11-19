// A flat polygon in 3D (fan-triangulated in its own plane): panels, decks, hatches, plates,
// fender tops, sign boards. One-sided; pass `doubleSided` for thin sheets seen from both sides.

import {
  cross,
  dot,
  length,
  type Mesh,
  MeshBuilder,
  normalize,
  sub,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { colorOf, invalid, profileOf } from './check.ts';
import { faceBand } from './strip-uv.ts';
import { triangulate } from './triangulate.ts';

export interface PlanarOptions {
  /** Counter-clockwise as seen from the side the face points to. */
  readonly points: readonly Vec3[];
  readonly color: Vec3;
  readonly strip?: StripId;
  readonly doubleSided?: boolean;
}

/**
 * Newell's method: the area-weighted normal of the whole loop (length = twice its area), which a
 * reflex or collinear first corner cannot flip or zero.
 */
function newell(points: readonly Vec3[]): Vec3 {
  const n: [number, number, number] = [0, 0, 0];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length] ?? p;
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  });
  return n;
}

const KEYS: Record<keyof PlanarOptions, true> = {
  points: true,
  color: true,
  strip: true,
  doubleSided: true,
};

export function planar(o: PlanarOptions): Mesh {
  colorOf('planar', o, KEYS);
  profileOf('planar points', o.points, 3);
  const [a = [0, 0, 0], b = a, c = a] = o.points;
  const loop = newell(o.points);
  // U runs along the first edge that has length (the loop may open with a repeated point).
  const edge = o.points.map((p, i) => sub(o.points[(i + 1) % o.points.length] ?? p, p));
  const along = edge.find((e) => length(e) > 1e-9);
  const reach = Math.max(...edge.map(length));
  if (!along || !(length(loop) > 1e-9 * reach * reach))
    invalid(
      'planar points are collinear or coincide, so the face has no area',
      'list the corners of a real polygon, counter-clockwise seen from the side it faces',
    );
  // The face lies in its first corner's plane, as it always has (same bytes), but the whole loop
  // says which side is the front; a collinear first corner has no plane, so the loop gives it.
  const corner = cross(sub(b, a), sub(c, a));
  const facing = dot(corner, loop);
  const cornered = length(corner) > 1e-9 * reach * reach && facing !== 0;
  const cn = normalize(corner);
  const n: Vec3 = !cornered ? normalize(loop) : facing > 0 ? cn : [-cn[0], -cn[1], -cn[2]];
  const u = normalize(along);
  const v = cross(n, u);
  const flat: Vec2[] = o.points.map((p) => [dot(sub(p, a), u), dot(sub(p, a), v)]);
  const rect = stripRect(o.strip ?? 'plain');
  const band = faceBand(flat.map((f) => f[1] / rect.metres));
  const tris = triangulate(flat);
  const mb = new MeshBuilder();
  for (const side of o.doubleSided ? [1, -1] : [1]) {
    const nn: Vec3 = [n[0] * side, n[1] * side, n[2] * side];
    const ids = o.points.map((p, i) => {
      const f = flat[i] ?? [0, 0];
      return mb.vertex({
        p,
        n: nn,
        uv: [
          rect.u0 + (f[0] / rect.metres) * (rect.u1 - rect.u0),
          rect.v0 + band(f[1] / rect.metres) * (rect.v1 - rect.v0),
        ],
        color: o.color,
      });
    });
    for (const [x, y, z] of tris) {
      const [i0 = 0, i1 = 0, i2 = 0] = [ids[x], ids[y], ids[z]];
      if (side > 0) mb.tri(i0, i1, i2);
      else mb.tri(i0, i2, i1);
    }
  }
  return mb.build();
}
