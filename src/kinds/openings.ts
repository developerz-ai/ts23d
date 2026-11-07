// Windows and doors as one mesh each: a reveal (surround in the wall's colour, so the glass reads
// set back by `depth`), stone sill and lintel, sash frame with glazing bars, or a panelled door
// leaf. The wall mass behind stays whole (no boolean cut): half the triangles, no T-junctions.
// Authored with the face at x = 0 looking +X, then turned to the requested side.
//   LOD0: everything · LOD1: no glazing bars / door panels · LOD2: glass or leaf only.

import { type Lod, type Mesh, merge, place, Ts23dError, type Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { box } from '../primitives/index.ts';
import { mass } from './mass.ts';

export type OpeningSide = 'front' | 'back' | 'left' | 'right';

export interface OpeningOptions {
  readonly kind: 'window' | 'door';
  /** Clear opening, metres (UK sash ≈ 0.9 × 1.6; door ≈ 0.9 × 2.1). */
  readonly width: number;
  readonly height: number;
  /** Bottom centre of the opening ON the wall face. */
  readonly at: Vec3;
  /** Which way the wall faces (front = +X, left = +Y). */
  readonly facing: OpeningSide;
  readonly glass: Vec3;
  /** Sash frame / door leaf colour. */
  readonly frame: Vec3;
  /** Reveal (surround) colour: the wall's, so the opening reads recessed. */
  readonly wall: Vec3;
  readonly wallStrip?: StripId;
  /** Sill + lintel colour (dressed stone). */
  readonly trim?: Vec3;
  /** Reveal depth, metres. Default 0.12 (half a brick). */
  readonly depth?: number;
  /** Reveal band width either side. Default 0.1. */
  readonly surround?: number;
  /** Glazing panes [across, up]: 2-over-2 sash = [2, 2]. Default window [2, 2]. */
  readonly panes?: readonly [number, number];
  readonly sill?: boolean;
  readonly lintel?: boolean;
}

const YAW: Record<OpeningSide, number> = {
  front: 0,
  left: Math.PI / 2,
  back: Math.PI,
  right: -Math.PI / 2,
};

/** Base-centred box flush on the wall face (x = 0), back face omitted (it is against the wall). */
const onWall = (size: Vec3, y: number, z: number, color: Vec3, strip?: StripId): Mesh =>
  box({ size, at: [size[0] / 2, y, z], color, omit: ['back'], ...(strip ? { strip } : {}) });

export function opening(o: OpeningOptions, lod: Lod = 0): Mesh {
  const { width: w, height: h } = o;
  if (!(w > 0.2 && h > 0.2 && Number.isFinite(w) && Number.isFinite(h)))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `${o.kind} opening is ${w} × ${h} m`,
      fix: 'give a clear width and height > 0.2 m (sash ≈ 0.9 × 1.6, door ≈ 0.9 × 2.1)',
    });
  const r = o.depth ?? 0.12;
  const s = o.surround ?? 0.1;
  const trim = o.trim ?? [0.78, 0.75, 0.68];
  const door = o.kind === 'door';
  const parts: Mesh[] = [];
  // The infill: glass flush on the wall, or the door leaf a little proud of it.
  parts.push(
    door
      ? onWall([0.05, w, h], 0, 0, o.frame, 'wood')
      : onWall([0.02, w, h], 0, 0, o.glass, 'glass'),
  );
  if (lod < 2) {
    const lintel = o.lintel ?? true;
    // Reveal masonry in true-scale courses aligned with the wall's (courses start at world z 0).
    const reveal = (size: Vec3, y: number, z: number): Mesh =>
      mass(
        {
          size,
          at: [size[0] / 2, y, z],
          color: o.wall,
          strip: o.wallStrip ?? 'plain',
          courseOrigin: -o.at[2],
          omit: ['back'],
        },
        lod,
      );
    for (const side of [-1, 1]) parts.push(reveal([r, s, h], side * (w / 2 + s / 2), 0));
    if (lintel) parts.push(onWall([r + 0.03, w + 2 * s + 0.2, 0.22], 0, h, trim, 'stone'));
    else parts.push(reveal([r, w + 2 * s, s], 0, h));
    if (!door && (o.sill ?? true))
      parts.push(onWall([r + 0.07, w + 2 * s + 0.12, 0.07], 0, -0.07, trim, 'stone'));
    if (!door) parts.push(...sash(o, w, h, lod));
    else if (lod === 0) parts.push(...panels(o, w, h));
  }
  return place(merge(parts), { yaw: YAW[o.facing], at: o.at });
}

/** Sash frame round the glass; glazing bars at LOD0. */
function sash(o: OpeningOptions, w: number, h: number, lod: Lod): Mesh[] {
  const f = 0.06;
  const d = 0.05;
  const out = [
    onWall([d, f, h], -(w / 2 - f / 2), 0, o.frame),
    onWall([d, f, h], w / 2 - f / 2, 0, o.frame),
    onWall([d, w - 2 * f, f], 0, 0, o.frame),
    onWall([d, w - 2 * f, f], 0, h - f, o.frame),
  ];
  if (lod > 0) return out;
  const [across, up] = o.panes ?? [2, 2];
  const bar = 0.03;
  for (let i = 1; i < across; i++)
    out.push(
      onWall([d * 0.8, bar, h - 2 * f], -w / 2 + f + ((w - 2 * f) * i) / across, f, o.frame),
    );
  for (let j = 1; j < up; j++)
    out.push(onWall([d * 0.8, w - 2 * f, bar], 0, f + ((h - 2 * f) * j) / up - bar / 2, o.frame));
  return out;
}

/** Four raised fielded panels on a door leaf (LOD0). */
function panels(o: OpeningOptions, w: number, h: number): Mesh[] {
  const out: Mesh[] = [];
  const pw = (w - 0.36) / 2;
  const tone: Vec3 = [o.frame[0] * 0.85, o.frame[1] * 0.85, o.frame[2] * 0.85];
  for (const y of [-1, 1])
    for (const [z0, ph] of [
      [0.15, h * 0.38],
      [0.15 + h * 0.38 + 0.15, h - 0.45 - h * 0.38],
    ] as const)
      out.push(
        box({
          size: [0.02, pw, ph],
          at: [0.06, y * (pw / 2 + 0.06), z0],
          color: tone,
          omit: ['back'],
        }),
      );
  // Knob on the lock side.
  out.push(
    box({ size: [0.06, 0.06, 0.06], at: [0.08, w / 2 - 0.12, h * 0.48], color: [0.7, 0.6, 0.3] }),
  );
  return out;
}
