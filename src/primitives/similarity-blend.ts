// A fraction of a similarity, for bending a chain smoothly: a head registered by its own fit
// (landmarks) and a body that stays, with the neck between them taking `w` of the head's move.
// The rotation is scaled in axis–angle (R^w about the same axis), the scale geometrically (s^w),
// and the pivot is carried linearly toward where the full transform puts it; w = 0 is the
// identity, w = 1 the transform itself. Rotations near 180° have no unique axis: refused.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import { applySimilarity, IDENTITY, type Similarity } from './similarity-fit.ts';

/** Rotation by `angle` (radians) about the unit `axis` (Rodrigues), row-major 3×3. */
function rotation(axis: Vec3, angle: number): number[] {
  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = 1 - c;
  return [
    c + x * x * k,
    x * y * k - z * s,
    x * z * k + y * s,
    y * x * k + z * s,
    c + y * y * k,
    y * z * k - x * s,
    z * x * k - y * s,
    z * y * k + x * s,
    c + z * z * k,
  ];
}

/** `w` of `m` (0 → identity, 1 → m) as a rotation about `pivot`, which moves toward m(pivot). */
export function similarityToward(m: Similarity, w: number, pivot: Vec3): Similarity {
  if (!(m.s > 0 && Number.isFinite(w)))
    invalid(
      `similarityToward: scale ${m.s}, fraction ${w}`,
      'pass a similarity with s > 0, w finite',
    );
  if (w === 0) return IDENTITY;
  const r = m.r;
  const g = (i: number): number => r[i] ?? 0;
  const angle = Math.acos(Math.max(-1, Math.min(1, (g(0) + g(4) + g(8) - 1) / 2)));
  if (angle > Math.PI - 1e-3)
    invalid(
      `similarityToward: a ${((angle * 180) / Math.PI).toFixed(1)}° turn has no unique axis`,
      'compose the turn in two steps (start the fit from a yaw near the answer)',
    );
  const sin = Math.sin(angle);
  const rw =
    sin < 1e-9
      ? IDENTITY.r
      : rotation(
          [(g(7) - g(5)) / (2 * sin), (g(2) - g(6)) / (2 * sin), (g(3) - g(1)) / (2 * sin)],
          angle * w,
        );
  const s = m.s ** w;
  const end = applySimilarity(m, pivot);
  const at: Vec3 = [
    pivot[0] + (end[0] - pivot[0]) * w,
    pivot[1] + (end[1] - pivot[1]) * w,
    pivot[2] + (end[2] - pivot[2]) * w,
  ];
  const turned = applySimilarity({ s, r: rw, t: [0, 0, 0] }, pivot);
  return { s, r: rw, t: [at[0] - turned[0], at[1] - turned[1], at[2] - turned[2]] };
}
