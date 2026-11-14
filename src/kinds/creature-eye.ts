// Creature eyes (ported from recipes/_lib/bust/eye.ts): the eyeball as its own part (sclera, a
// darker limbal ring, an iris of declared size, round or slit pupil, a cornea bulge) gazing +X, and
// the skin around it as sculpt edits — upper and lower lids with real thickness that wrap the ball
// and cover a declared share of the iris, a wet line on the lower lid, the caruncle at the inner
// corner — turned as one about Z to the orbit's `aperture` angle (a horse's eye opens sideways, a
// cat's forward). QA `connections` holds the result: the ball enclosed, the upper lid on the iris.

import type { Mesh, Vec3 } from '../core/index.ts';
import { type SculptEdit, sdf } from '../primitives/index.ts';
import { v3 } from './creature-curve.ts';

type V = Vec3;
const add = v3.add;
const mul = v3.mul;
const norm = v3.norm;

export interface EyeColours {
  readonly sclera: V;
  readonly iris: V;
  readonly pupil: V;
  /** Limbal ring (the dark edge of the iris); default iris × 0.35. */
  readonly limbus?: V;
  /** Lower-lid wet line. */
  readonly wet: V;
  /** Caruncle at the inner corner. */
  readonly caruncle: V;
}

export interface EyeSpec {
  /** Left eyeball centre (the right is mirrored), metres. */
  readonly centre: V;
  /** Eyeball radius (human ≈ 0.012). */
  readonly r: number;
  /** Iris radius measured on the ball (human ≈ 0.0058, an 11.7 mm iris). */
  readonly iris: number;
  /** Share of the iris the upper / lower lid covers at rest (human ≈ 0.25 / 0.12). */
  readonly upper: number;
  readonly lower: number;
  /** Lid thickness, metres (human ≈ 0.002). */
  readonly lid: number;
  /** Lid-line tilt, degrees: + lifts the outer corner (almond / elf), − droops it. */
  readonly tilt?: number;
  /** Upper lid lowered toward the nose, degrees (a scowl). */
  readonly scowl?: number;
  /** Where the left eye looks (the right mirrors); default 1.5 m straight ahead of the face. */
  readonly gaze?: V;
  /** Yaw of the lid opening off +X toward the eye's own side, degrees (90° − orbit convergence:
   *  cat ≈ 25, dog ≈ 40, horse ≈ 65; default 0). */
  readonly aperture?: number;
  readonly pupil?: 'round' | 'slit';
  readonly colours: EyeColours;
}

const deg = Math.PI / 180;

/** World → eye-local: undo the aperture yaw about the eye centre (lids are built facing +X). */
function toLocal(e: EyeSpec): (p: V) => V {
  const a = -(e.aperture ?? 0) * deg;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [ex, ey] = e.centre;
  return (p) => {
    const x = p[0] - ex;
    const y = p[1] - ey;
    return [ex + c * x - s * y, ey + s * x + c * y, p[2]];
  };
}

/** Eye-local direction → world (apply the aperture yaw). */
function toWorldDir(e: EyeSpec, d: V): V {
  const a = (e.aperture ?? 0) * deg;
  return [Math.cos(a) * d[0] - Math.sin(a) * d[1], Math.sin(a) * d[0] + Math.cos(a) * d[1], d[2]];
}

/** Half-height of the iris on the ball's front, and its angular radius. */
function irisOf(e: EyeSpec): { h: number; a: number } {
  const a = Math.asin(Math.min(0.95, e.iris / e.r));
  return { h: e.r * Math.sin(a), a };
}

/** A cap of the ball (grown by `t`) on one side of a tilted lid plane, front half only. */
function lidShell(e: EyeSpec, upper: boolean): SculptEdit {
  const [ex, ey, ez] = e.centre;
  const { h } = irisOf(e);
  const edge = upper ? h * (1 - 2 * e.upper) : -h * (1 - 2 * e.lower);
  const tilt = (e.tilt ?? 0) * deg;
  const scowl = (upper ? (e.scowl ?? 0) : 0) * deg;
  // Lid plane: through the lid edge, its normal tilted about the gaze (X) axis so the outer
  // corner (+Y) rises by `tilt` and a scowl drops the inner end.
  const ny = Math.sin(-tilt + scowl);
  const nz = Math.cos(-tilt + scowl);
  const n: V = upper ? [0, ny, -nz] : [0, -ny, nz];
  const at: V = [ex, ey, ez + edge];
  const r = e.r + e.lid;
  const local = toLocal(e);
  const plane = (q: V): number => {
    const p = local(q);
    return (
      ((p[0] - at[0]) * n[0] + (p[1] - at[1]) * n[1] + (p[2] - at[2]) * n[2]) / Math.hypot(...n)
    );
  };
  const pad = r + 0.01;
  return {
    group: [
      { shape: 'sphere', at: e.centre, size: r },
      {
        field: plane,
        bounds: [
          [ex - pad, ey - pad, ez - pad],
          [ex + pad, ey + pad, ez + pad],
        ],
        op: 'intersect',
        blend: e.lid * 0.6,
      },
      {
        field: (q) => ex - e.r * 0.8 - local(q)[0],
        bounds: [
          [ex - pad, ey - pad, ez - pad],
          [ex + pad, ey + pad, ez + pad],
        ],
        op: 'intersect',
        blend: e.lid,
      },
    ],
    blend: e.lid * 1.4,
  };
}

/**
 * The skin edits round the eye, appended after the face's socket carve: both lids, the wet line
 * painted along the lower lid's margin, the caruncle. All mirrored with the sculpt.
 */
export function lidEdits(e: EyeSpec): SculptEdit[] {
  const [ex, ey, ez] = e.centre;
  const { h } = irisOf(e);
  const out: SculptEdit[] = [lidShell(e, true), lidShell(e, false)];
  // Wet line: a thin lighter band on the lower lid's upper margin, painted.
  const z = ez - h * (1 - 2 * e.lower) + e.lid * 0.3;
  const R = e.r + e.lid * 0.6;
  const pad = R + 0.004;
  const local = toLocal(e);
  out.push({
    field: (q) => {
      const p = local(q);
      const d = Math.hypot(p[0] - ex, p[1] - ey, p[2] - ez) - R;
      const front = Math.max(0, ex + e.r * 0.2 - p[0]);
      return Math.hypot(d, p[2] - z) - e.lid * 0.45 + front;
    },
    bounds: [
      [ex - pad, ey - pad, ez - pad],
      [ex + pad, ey + pad, ez + pad],
    ],
    op: 'paint',
    blend: e.lid * 0.5,
    color: e.colours.wet,
  });
  // Caruncle: the pink knot at the inner corner, tucked against the ball.
  const inner = toWorldDir(e, norm([Math.cos(58 * deg), -Math.sin(58 * deg), -0.08]));
  out.push({
    shape: 'ellipsoid',
    at: add(e.centre, mul(inner, e.r * 0.93)),
    size: [e.r * 0.16, e.r * 0.13, e.r * 0.2],
    rotate: [0, 0, e.aperture ?? 0],
    blend: e.lid * 0.5,
    color: e.colours.caruncle,
  });
  return out;
}

/** The eyeball mesh about its own centre, gazing +X: sclera, limbus, iris, pupil, cornea bulge. */
export function eyeball(e: EyeSpec, cell: number): Mesh {
  const r = e.r;
  const { a } = irisOf(e);
  const c = e.colours;
  const limbus = c.limbus ?? [c.iris[0] * 0.35, c.iris[1] * 0.35, c.iris[2] * 0.35];
  const cosIris = Math.cos(a);
  const cosLimb = Math.cos(a * 1.12);
  const cosPupil = Math.cos(a * 0.42);
  // Cornea: a slightly smaller-radius cap over the iris, standing a little proud of the ball.
  const cr = r * 0.78;
  const cx = r - cr + r * 0.06;
  return sdf({
    field: (q) =>
      Math.min(Math.hypot(q[0], q[1], q[2]) - r, Math.hypot(q[0] - cx, q[1], q[2]) - cr),
    bounds: [
      [-r * 1.3, -r * 1.3, -r * 1.3],
      [r * 1.3, r * 1.3, r * 1.3],
    ],
    resolution: cell,
    color: (q) => {
      const cos = q[0] / (Math.hypot(q[0], q[1], q[2]) || 1);
      const slit = e.pupil === 'slit' && Math.abs(q[1]) < r * 0.09 && cos > Math.cos(a * 0.85);
      if (slit || (e.pupil !== 'slit' && cos > cosPupil)) return c.pupil;
      if (cos > cosIris) {
        // Iris: darker toward its rim, lighter round the pupil.
        const t = (cos - cosIris) / (1 - cosIris);
        return [
          Math.min(1, c.iris[0] * (0.7 + 0.5 * t)),
          Math.min(1, c.iris[1] * (0.7 + 0.5 * t)),
          Math.min(1, c.iris[2] * (0.7 + 0.5 * t)),
        ];
      }
      if (cos > cosLimb) return limbus;
      // Sclera: a touch darker toward the back (it sits in shadow inside the socket).
      const k = 0.75 + 0.25 * Math.max(0, cos);
      return [c.sclera[0] * k, c.sclera[1] * k, c.sclera[2] * k];
    },
  });
}
