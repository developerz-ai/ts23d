// A flat polygon in 3D (fan-triangulated in its own plane): panels, decks, hatches, plates,
// fender tops, sign boards. One-sided; pass `doubleSided` for thin sheets seen from both sides.

import {
  cross,
  dot,
  type Mesh,
  MeshBuilder,
  normalize,
  sub,
  type Vec2,
  type Vec3,
} from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { triangulate } from './triangulate.ts';

export interface PlanarOptions {
  /** Counter-clockwise as seen from the side the face points to. */
  readonly points: readonly Vec3[];
  readonly color: Vec3;
  readonly strip?: StripId;
  readonly doubleSided?: boolean;
}

export function planar(o: PlanarOptions): Mesh {
  const [a = [0, 0, 0], b = [1, 0, 0], c = [0, 1, 0]] = o.points;
  const n = normalize(cross(sub(b, a), sub(c, a)));
  const u = normalize(sub(b, a));
  const v = cross(n, u);
  const flat: Vec2[] = o.points.map((p) => [dot(sub(p, a), u), dot(sub(p, a), v)]);
  const rect = stripRect(o.strip ?? 'plain');
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
          rect.v0 + ((((f[1] / rect.metres) % 1) + 1) % 1) * (rect.v1 - rect.v0),
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
