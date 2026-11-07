// A building mass (walls block) whose masonry is laid at TRUE scale: every side is cut into
// course bands of the strip's `scaleMetres`, all starting from the ground line, so brick courses
// match across sides and across stacked masses. `box` stretches one strip band over the whole face
// — fine for trim, wrong for a 6 m brick wall. LOD2 keeps one quad per side (V squeezed).

import { type Lod, type Mesh, MeshBuilder, Ts23dError, type Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { emitFace } from './faces.ts';

export interface MassOptions {
  /** Width (X), depth (Y), height (Z). */
  readonly size: Vec3;
  /** Centre of the base. */
  readonly at?: Vec3;
  readonly color: Vec3;
  readonly strip?: StripId;
  /** Courses start at this world z (default 0, the ground) so stacked masses line up. */
  readonly courseOrigin?: number;
  /** Skip faces nobody sees (bottom on the ground, top under a roof, a party wall). */
  readonly omit?: readonly ('top' | 'bottom' | 'front' | 'back' | 'left' | 'right')[];
}

export function mass(o: MassOptions, lod: Lod = 0): Mesh {
  const [w, d, h] = o.size;
  if (!(w > 0 && d > 0 && h > 0))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `mass size is [${o.size.join(', ')}]`,
      fix: 'give width (X), depth (Y) and height (Z) in metres, all > 0',
    });
  const [cx, cy, z0] = o.at ?? [0, 0, 0];
  const [x0, x1, y0, y1, z1] = [cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, z0 + h];
  const b = new MeshBuilder();
  const strip = o.strip ?? 'brick';
  const origin: Vec3 = [0, 0, o.courseOrigin ?? 0];
  const sides: [NonNullable<MassOptions['omit']>[number], Vec3, Vec3[]][] = [
    [
      'front',
      [1, 0, 0],
      [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
    ],
    [
      'back',
      [-1, 0, 0],
      [
        [x0, y1, z0],
        [x0, y0, z0],
        [x0, y0, z1],
        [x0, y1, z1],
      ],
    ],
    [
      'left',
      [0, 1, 0],
      [
        [x1, y1, z0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
      ],
    ],
    [
      'right',
      [0, -1, 0],
      [
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
      ],
    ],
  ];
  for (const [name, normal, points] of sides) {
    if (o.omit?.includes(name)) continue;
    emitFace(b, {
      points,
      normal,
      up: [0, 0, 1],
      vOrigin: origin,
      color: o.color,
      strip,
      banded: lod < 2,
    });
  }
  for (const [name, z, s] of [
    ['top', z1, 1],
    ['bottom', z0, -1],
  ] as const) {
    if (o.omit?.includes(name)) continue;
    emitFace(b, {
      points: [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ],
      normal: [0, 0, s],
      up: [0, 1, 0],
      vOrigin: [cx, y0, z],
      color: o.color,
      strip: 'plain',
      banded: false,
    });
  }
  return b.build();
}
