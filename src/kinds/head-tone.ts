// Hand-painted tone for sculpted head/bust vertex colour: the painter's three passes done from the
// distance field itself — cavity (crevices, folds, sockets go darker and a touch more saturated),
// a warm key from above (top planes lifted and warmed), and a cool bounce underneath. Pure field
// sampling at the surface point, so it is deterministic and costs ~9 field evaluations per vertex.

import type { Vec3 } from '../core/index.ts';
import type { Field } from '../primitives/index.ts';

export interface ToneOptions {
  /** Probe distance for the cavity test, head units (≈ the size of a fold). */
  readonly reach: number;
  /** 0 = flat colour, 1 = full painted tone. */
  readonly strength?: number;
}

/** Wraps `colorAt` with cavity darkening and a warm-top / cool-under gradient. */
export function toned(field: Field, colorAt: (q: Vec3) => Vec3, o: ToneOptions): (q: Vec3) => Vec3 {
  const k = o.strength ?? 1;
  const d = o.reach;
  const e = d * 0.25;
  return (q) => {
    const c = colorAt(q);
    const [x, y, z] = q;
    const gx = field([x + e, y, z]) - field([x - e, y, z]);
    const gy = field([x, y + e, z]) - field([x, y - e, z]);
    const gz = field([x, y, z + e]) - field([x, y, z - e]);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const n: Vec3 = [gx / gl, gy / gl, gz / gl];
    // Cavity: walk out along the normal; a crevice brings other surface closer than the walk.
    let occ = 0;
    for (let i = 1; i <= 3; i++) {
      const t = (d * i) / 3;
      occ += Math.max(0, t - field([x + n[0] * t, y + n[1] * t, z + n[2] * t])) / t / i;
    }
    const cav = Math.min(1, occ * 2.5) * k;
    const up = n[2] * k;
    const lift = up > 0 ? 1 + up * 0.22 : 1 + up * 0.3;
    const warm: Vec3 =
      up > 0 ? [1 + up * 0.12, 1 + up * 0.05, 1 - up * 0.15] : [1 + up * 0.1, 1, 1 - up * 0.12];
    const dark = 1 - cav * 0.55;
    const lum = (c[0] + c[1] + c[2]) / 3;
    // Saturate into the crevice: push each channel away from the grey by the cavity.
    const sat = 1 + cav * 0.35;
    return [
      clamp((lum + (c[0] - lum) * sat) * dark * lift * warm[0]),
      clamp((lum + (c[1] - lum) * sat) * dark * lift * warm[1]),
      clamp((lum + (c[2] - lum) * sat) * dark * lift * warm[2]),
    ];
  };
}

const clamp = (v: number): number => Math.min(Math.max(v, 0), 1);
