// Axis-aligned box, base at z=0 (things stand on the ground). UVs tile a trim strip by metres.

import { type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

export interface BoxOptions {
  /** Width (X), depth (Y), height (Z) in metres. */
  readonly size: Vec3;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Centre of the base face. */
  readonly at?: Vec3;
  /** Skip faces nobody sees (e.g. the bottom on the ground). */
  readonly omit?: readonly ('top' | 'bottom' | 'front' | 'back' | 'left' | 'right')[];
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
  const [w, d, h] = o.size;
  const [cx, cy, cz] = o.at ?? [0, 0, 0];
  const half: Vec3 = [w / 2, d / 2, h / 2];
  const centre: Vec3 = [cx, cy, cz + h / 2];
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
