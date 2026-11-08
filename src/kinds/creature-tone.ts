// Hand-painted tone for sculpted creatures (ported from recipes/_lib/creature/tone.ts), computed
// from the distance field at each surface vertex: cavity (folds, sockets go darker and more
// saturated), a warm key from above, a cool bounce from below, a ground occlusion band near z = 0,
// highlights on thin up-facing crests, shadows cast cool red-violet rather than black. ~10 field
// samples per vertex, deterministic.

import type { Vec3 } from '../core/index.ts';
import type { Field } from '../primitives/index.ts';

export interface ToneOptions {
  /** Cavity probe distance, metres (about one fold). */
  readonly reach: number;
  /** Overall strength 0..1. */
  readonly strength?: number;
  /** Cavity darkening 0..1 (default 0.55). */
  readonly cavity?: number;
  /** Top lift / bottom drop (default 0.22 / 0.3). */
  readonly top?: number;
  readonly under?: number;
  /** Edge highlight on thin up-facing crests (default 0.35). */
  readonly edge?: number;
  /** Height over which the ground darkens the surface, metres (0 = off). */
  readonly ground?: number;
}

const clamp = (v: number): number => Math.min(1, Math.max(0, v));

export function painted(
  field: Field,
  colorAt: (q: Vec3) => Vec3,
  o: ToneOptions,
): (q: Vec3) => Vec3 {
  const k = o.strength ?? 1;
  const d = o.reach;
  const e = d * 0.25;
  const cavK = o.cavity ?? 0.55;
  const topK = o.top ?? 0.22;
  const underK = o.under ?? 0.3;
  const g = o.ground ?? 0;
  return (q) => {
    const c = colorAt(q);
    const [x, y, z] = q;
    const gx = field([x + e, y, z]) - field([x - e, y, z]);
    const gy = field([x, y + e, z]) - field([x, y - e, z]);
    const gz = field([x, y, z + e]) - field([x, y, z - e]);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const n: Vec3 = [gx / gl, gy / gl, gz / gl];
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const t = (d * i) / 3;
      occ += Math.max(0, t - field([x + n[0] * t, y + n[1] * t, z + n[2] * t])) / t / i;
    }
    const cav = Math.min(1, occ * 2.5) * k;
    const up = n[2] * k;
    const lift = up > 0 ? 1 + up * topK : 1 + up * underK;
    const warm: Vec3 =
      up > 0 ? [1 + up * 0.1, 1 + up * 0.04, 1 - up * 0.12] : [1 + up * 0.08, 1, 1 - up * 0.1];
    // Edge highlight: thin up-facing crests (wing bones, horn ridges, spine edges) catch the key.
    const ti = d * 0.6;
    const crest = clamp((field([x - n[0] * ti, y - n[1] * ti, z - n[2] * ti]) + ti) / ti);
    const edge = 1 + (o.edge ?? 0.35) * crest * Math.max(0, n[2]) * k;
    const ground = g > 0 ? 0.62 + 0.38 * clamp(z / g) : 1;
    // Shadow = 1 − light, cast cool red-violet (blue falls off least), never toward black.
    const s = 1 - (1 - cav * cavK) * ground;
    const shade: Vec3 = [1 - s, 1 - s * 1.05, 1 - s * 0.7];
    const lum = (c[0] + c[1] + c[2]) / 3;
    const sat = 1 + cav * 0.35;
    return [
      clamp((lum + (c[0] - lum) * sat) * shade[0] * lift * edge * warm[0]),
      clamp((lum + (c[1] - lum) * sat) * shade[1] * lift * edge * warm[1]),
      clamp((lum + (c[2] - lum) * sat) * shade[2] * lift * edge * warm[2]),
    ];
  };
}
