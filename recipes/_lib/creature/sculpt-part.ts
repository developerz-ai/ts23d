// One sculpted creature piece → Mesh: edit list → sculpt field → optional surface relief (scales,
// wrinkles: a displacement evaluated only near the surface) → mesh at `res` → vertex colour from
// the edits' blended colours, a recipe's paint pass (patterns, plate seams) and the painted tone.

import {
  type Field,
  type Mesh,
  type SculptEdit,
  type StripId,
  sculptField,
  sdf,
  type Vec3,
} from '@developerz.ai/ts23d';
import { painted, type ToneOptions } from './tone.ts';

export interface Relief {
  /** Outward offset in metres at surface point p (|value| ≤ amp). */
  readonly at: (p: Vec3) => number;
  readonly amp: number;
}

export interface SculptPartOptions {
  readonly edits: readonly SculptEdit[];
  /** Cell edge, metres (LOD knob). */
  readonly res: number;
  readonly color: Vec3;
  /**
   * Left/right symmetric: the field is evaluated at (x, |y|, z), so author the left side (+Y) only
   * and every edit appears on both sides at the cost of one (a `mirror` edit flag would evaluate
   * both copies). Shapes crossing y = 0 should be symmetric themselves. Grid snapped symmetric.
   */
  readonly mirror?: boolean;
  readonly strip?: StripId;
  readonly tone?: ToneOptions;
  readonly relief?: Relief;
  /** Recolour after the edits' colours, before tone: (point, colour) → colour. */
  readonly paint?: (p: Vec3, c: Vec3) => Vec3;
  /** Clip the meshing box (e.g. drop what hides inside another part). */
  readonly clip?: readonly [Vec3, Vec3];
  /**
   * Split one sculpt into parts that share a surface: keep only what lies outside (or inside) a
   * region field (negative inside). Tone still reads the uncut field, so colours match across
   * the cut. Pair `keep: 'out'` on the big part with `keep: 'in'` (region grown a little) on the
   * small one: the overlap hides the seam.
   */
  readonly cut?: { readonly field: Field; readonly keep: 'in' | 'out' };
  /** Snap the grid symmetric about y = 0 (default: when `mirror`). */
  readonly snap?: boolean;
}

export interface SculptPart {
  readonly mesh: Mesh;
  /** The final (relieved) field, for probes: seating eyes, teeth, plates. */
  readonly field: Field;
}

export function sculptPart(o: SculptPartOptions): SculptPart {
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
  const cut = o.cut;
  const shape: Field = cut
    ? cut.keep === 'out'
      ? (p) => Math.max(field(p), -cut.field(p))
      : (p) => Math.max(field(p), cut.field(p))
    : field;
  const pad = rel ? rel.amp : 0;
  const [lo0, hi0] = o.clip ?? s.bounds;
  // Folded: the left half's bounds, reflected.
  const ym = Math.max(Math.abs(lo0[1]), Math.abs(hi0[1]));
  const [lo, hi]: readonly [Vec3, Vec3] =
    o.mirror && !o.clip
      ? [
          [lo0[0], -ym, lo0[2]],
          [hi0[0], ym, hi0[2]],
        ]
      : [lo0, hi0];
  const bounds: [Vec3, Vec3] = [
    [lo[0] - pad, lo[1] - pad, lo[2] - pad],
    [hi[0] + pad, hi[1] + pad, hi[2] + pad],
  ];
  const paint = o.paint;
  const base = paint ? (p: Vec3): Vec3 => paint(p, colorAt(p)) : colorAt;
  const color = o.tone ? painted(field, base, o.tone) : base;
  const mesh = sdf({
    field: shape,
    bounds,
    resolution: o.res,
    color: (q) => color(q),
    lipschitz: rel ? 1.6 : 1.25,
    ...((o.snap ?? o.mirror) ? { symmetry: 'y' as const } : {}),
    ...(o.strip ? { strip: o.strip } : {}),
  });
  return { mesh, field };
}
