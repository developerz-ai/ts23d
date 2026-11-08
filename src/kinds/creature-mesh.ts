// One sculpted creature piece → Mesh (ported from recipes/_lib/creature/sculpt-part.ts): edit list
// → sculpt field (folded |y| when mirrored: author the left side once) → optional surface relief
// (fur clumps, scales, feathers: a displacement evaluated only near the surface) → mesh at `res`
// → vertex colour from the edits' colours, the coat paint pass and the painted tone.

import type { Mesh, Vec3 } from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { type Field, type SculptEdit, sculptField, sdf } from '../primitives/index.ts';
import { painted, type ToneOptions } from './creature-tone.ts';

export interface Relief {
  /** Outward offset in metres at surface point p (|value| ≤ amp). */
  readonly at: (p: Vec3) => number;
  readonly amp: number;
}

export interface PieceOptions {
  readonly edits: readonly SculptEdit[];
  /** Cell edge, metres (the LOD knob). */
  readonly res: number;
  readonly color: Vec3;
  readonly mirror: boolean;
  readonly strip?: StripId;
  readonly tone?: ToneOptions;
  readonly relief?: Relief;
  /** Recolour after the edits' colours, before tone: (point, colour) → colour. */
  readonly paint?: (p: Vec3, c: Vec3) => Vec3;
}

export interface Piece {
  readonly mesh: Mesh;
  /** The final (relieved, unfolded) field, for probes and volume. */
  readonly field: Field;
}

export function sculptPiece(o: PieceOptions): Piece {
  const s = sculptField(o.edits, { color: o.color });
  const q: [number, number, number] = [0, 0, 0];
  const fold = (p: Vec3): Vec3 => {
    q[0] = p[0];
    q[1] = Math.abs(p[1]);
    q[2] = p[2];
    return q;
  };
  const raw: Field = o.mirror ? (p) => s.field(fold(p)) : s.field;
  const colorAt = o.mirror ? (p: Vec3): Vec3 => s.colorAt(fold(p)) : s.colorAt;
  const rel = o.relief;
  const field: Field = rel
    ? (p) => {
        const d = raw(p);
        return Math.abs(d) > rel.amp * 2.5 ? d : d - rel.at(p);
      }
    : raw;
  const pad = rel ? rel.amp : 0;
  const [lo, hi] = s.bounds;
  const ym = Math.max(Math.abs(lo[1]), Math.abs(hi[1]));
  const y0 = o.mirror ? -ym : lo[1];
  const y1 = o.mirror ? ym : hi[1];
  const paint = o.paint;
  const base = paint ? (p: Vec3): Vec3 => paint(p, colorAt(p)) : colorAt;
  const color = o.tone ? painted(field, base, o.tone) : base;
  const box: [Vec3, Vec3] = [
    [lo[0] - pad, y0 - pad, lo[2] - pad],
    [hi[0] + pad, y1 + pad, hi[2] + pad],
  ];
  // The sdf grid caps at 2^24 points: a big outline (spread wings) coarsens the cell to fit.
  const vol = (box[1][0] - box[0][0]) * (box[1][1] - box[0][1]) * (box[1][2] - box[0][2]);
  const res = Math.max(o.res, (vol / 14e6) ** (1 / 3));
  const mesh = sdf({
    field,
    bounds: box,
    resolution: res,
    color: (p) => color(p),
    lipschitz: rel ? 1.6 : 1.25,
    ...(o.mirror ? { symmetry: 'y' as const } : {}),
    ...(o.strip ? { strip: o.strip } : {}),
  });
  return { mesh, field };
}
