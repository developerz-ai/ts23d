// Axis-aligned box, base at z=0 (things stand on the ground). UVs tile a trim strip by metres.
// Flat normals. `bevel` > 0 chamfers every edge once (bevel-box.ts); 0 keeps these exact bytes.

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';
import { bevelBox } from './bevel-box.ts';
import { invalid, positive } from './check.ts';

export interface BoxOptions {
  /** Width (X), depth (Y), height (Z) in metres. */
  readonly size: Vec3;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Centre of the base face. */
  readonly at?: Vec3;
  /** Skip faces nobody sees (e.g. the bottom on the ground). */
  readonly omit?: readonly ('top' | 'bottom' | 'front' | 'back' | 'left' | 'right')[];
  /** Chamfer width in metres on every edge (12 + 8 extra faces, 44 triangles). LOD it:
   *  `bevel: ctx.pick([0.02, 0.01, 0])`. Must stay under half the smallest size. Default 0. */
  readonly bevel?: number;
}

type Face = { name: NonNullable<BoxOptions['omit']>[number]; n: Vec3; u: Vec3; v: Vec3 };
const FACES: readonly Face[] = [
  { name: 'front', n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { name: 'back', n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1] },
  { name: 'right', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { name: 'left', n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1] },
  { name: 'top', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { name: 'bottom', n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0] },
];

export function box(o: BoxOptions): Mesh {
  const eg = 'size: [2, 1, 0.5]';
  const w = positive('box width size[0]', o.size[0], eg);
  const d = positive('box depth size[1]', o.size[1], eg);
  const h = positive('box height size[2]', o.size[2], eg);
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const half: Vec3 = [w / 2, d / 2, h / 2];
  const centre: Vec3 = [cx, cy, cz + h / 2];
  const bevel = o.bevel ?? 0;
  if (bevel !== 0) {
    const limit = Math.min(w, d, h) / 2;
    // A micron of face must remain: a bevel equal to the half-size up to float rounding passes a
    // bare `<` and collapses that face to a line of zero-area triangles.
    if (!(bevel > 0 && bevel < limit - 1e-6))
      invalid(
        `box bevel ${bevel} m does not fit a ${w} × ${d} × ${h} m box`,
        `use 0 < bevel < ${limit} m (half the smallest size), e.g. ${Math.min(0.02, limit / 4)}`,
      );
    return bevelBox({
      half,
      centre,
      bevel,
      color: o.color,
      strip: o.strip ?? 'plain',
      omit: o.omit ?? [],
    });
  }
  const rect = stripRect(o.strip ?? 'plain');
  const b = new MeshBuilder();
  for (const f of FACES) {
    if (o.omit?.includes(f.name)) continue;
    const extent = (axis: Vec3): number =>
      Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
    const eu = extent(f.u);
    const ev = extent(f.v);
    const en = extent(f.n);
    const ids = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([su = 0, sv = 0]) => {
      const p: Vec3 = [0, 1, 2].map(
        (k) =>
          (centre[k] ?? 0) + (f.n[k] ?? 0) * en + (f.u[k] ?? 0) * eu * su + (f.v[k] ?? 0) * ev * sv,
      ) as unknown as Vec3;
      const uMetres = ((su + 1) / 2) * eu * 2;
      const vFrac = (sv + 1) / 2;
      return b.vertex({
        p,
        n: f.n,
        uv: [
          rect.u0 + (uMetres / rect.metres) * (rect.u1 - rect.u0),
          rect.v0 + vFrac * (rect.v1 - rect.v0),
        ],
        color: o.color,
      });
    });
    const [a = 0, c = 0, e = 0, g = 0] = ids;
    b.quad(a, c, e, g);
  }
  return b.build();
}
