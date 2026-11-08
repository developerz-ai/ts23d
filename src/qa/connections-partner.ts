// Which piece holds a piece: the declared `connect.to` part, else the shell of another part it
// shares the most contact with (patch area, embedded area counted). Plus the piece's long axis
// (principal direction of its surface samples) the grown and poke checks measure along.

import type { Vec3 } from '../core/index.ts';
import type { Shell } from './connections-shells.ts';
import { boxGap, epsOf, type Patch, patch, type Samples, stepOf } from './contact.ts';
import { glob } from './inspect.ts';
import { CONTACT_EPS } from './types.ts';

export interface Partner {
  readonly shell: Shell;
  readonly patch: Patch;
}

/** The piece `s` is held by, or null when it touches no other part. */
export function partnerOf(s: Shell, shells: readonly Shell[], to: string | null): Partner | null {
  const match = to ? glob(to) : null;
  let best: Partner | null = null;
  for (const c of shells) {
    if (c.part === s.part || c.area <= 1e-9) continue;
    if ((match && !match.test(c.part)) || boxGap(s, c) > CONTACT_EPS) continue;
    const p = patch(s, c, epsOf(s), stepOf(s));
    if (!p.touches) continue;
    const score = p.area + p.buried;
    if (!best || score > best.patch.area + best.patch.buried) best = { shell: c, patch: p };
  }
  return best;
}

/** Principal axis of weighted points (power iteration on the covariance; deterministic). */
export function principalAxis(S: Samples): { centre: Vec3; axis: Vec3 } {
  let W = 0;
  const c = [0, 0, 0];
  for (let i = 0; i < S.count; i++) {
    const w = S.w[i] ?? 0;
    W += w;
    for (let k = 0; k < 3; k++) c[k] = (c[k] ?? 0) + (S.p[i * 3 + k] ?? 0) * w;
  }
  const centre: Vec3 = W > 0 ? [(c[0] ?? 0) / W, (c[1] ?? 0) / W, (c[2] ?? 0) / W] : [0, 0, 0];
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < S.count; i++) {
    const w = S.w[i] ?? 0;
    const d = [0, 1, 2].map((k) => (S.p[i * 3 + k] ?? 0) - (centre[k as 0 | 1 | 2] ?? 0));
    for (let r = 0; r < 3; r++)
      for (let q = 0; q < 3; q++)
        C[r * 3 + q] = (C[r * 3 + q] ?? 0) + w * (d[r] ?? 0) * (d[q] ?? 0);
  }
  let v = [0.577, 0.578, 0.576];
  for (let it = 0; it < 32; it++) {
    const n = [0, 1, 2].map(
      (r) =>
        (C[r * 3] ?? 0) * (v[0] ?? 0) +
        (C[r * 3 + 1] ?? 0) * (v[1] ?? 0) +
        (C[r * 3 + 2] ?? 0) * (v[2] ?? 0),
    );
    const len = Math.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0);
    if (len < 1e-18) break;
    v = n.map((x) => x / len);
  }
  return { centre, axis: [v[0] ?? 1, v[1] ?? 0, v[2] ?? 0] };
}

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 1];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Two unit vectors perpendicular to `a` (and each other). */
export function basis(a: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(a, helper));
  return [u, cross(a, u)];
}
