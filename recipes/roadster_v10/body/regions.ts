// Panel regions on the body surface: inverse lookups (u where a row reaches a height or a
// half-width), wheel-arch and cockpit cut lines, shut-line insets in true millimetres and row
// placement that lands exactly on the arch edges. Everything a panel's lo/hi needs.

import type { Vec3 } from '@developerz.ai/ts23d';
import { ARCH_F, ARCH_R, X_COCKPIT_REAR, X_COWL, X_FA, X_RA, Z_FA, Z_RA } from '../dims.ts';
import { clamp, len, sub } from '../lib/geo.ts';
import type { Surface } from '../lib/grid.ts';
import { sAtX, U, U_MAX } from './shape.ts';

/** Panel shut line, metres (each side gives half). */
export const GAP = 0.0045;

/** |∂S/∂u| at (s, u): metres per unit u. */
export function uMetres(S: Surface, s: number, u: number): number {
  const e = 1e-3;
  const r = S.row(s);
  const a = clamp(u - e, 0, U_MAX);
  const b = clamp(u + e, 0, U_MAX);
  return len(sub(r(b), r(a))) / (b - a || 1);
}

/** |∂S/∂s| at (s, u): metres per unit s. */
export function sMetres(S: Surface, s: number, u: number): number {
  const e = 1e-3;
  const [lo, hi] = S.sRange;
  const a = clamp(s - e, lo, hi);
  const b = clamp(s + e, lo, hi);
  return len(sub(S.row(b)(u), S.row(a)(u))) / (b - a || 1);
}

/** u shifted by `m` metres along the row (positive = toward larger u). */
export const uPlus = (S: Surface, s: number, u: number, m: number): number =>
  clamp(u + m / uMetres(S, s, u), 0, U_MAX);

/** s shifted by `m` metres along the body at u. */
export const sPlus = (S: Surface, s: number, u: number, m: number): number =>
  s + m / sMetres(S, s, u);

/** Bisection for u ∈ [a, b] where component k of the row point equals v (monotone there). */
export function uWhere(
  S: Surface,
  s: number,
  k: 0 | 1 | 2,
  v: number,
  a: number,
  b: number,
): number {
  const r = S.row(s);
  let lo = a;
  let hi = b;
  const up = (r(b)[k] ?? 0) > (r(a)[k] ?? 0);
  for (let i = 0; i < 36; i++) {
    const m = (lo + hi) / 2;
    const val = r(m)[k] ?? 0;
    if (val < v === up) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** u where the row's half-width reaches y, searched over the top (centre → shoulder). */
export const uAtY = (S: Surface, s: number, y: number): number =>
  uWhere(S, s, 1, y, U.centre, U.shoulder);

/** u where the side reaches height z (shoulder → under: z falls). */
export const uAtZ = (S: Surface, s: number, z: number): number =>
  uWhere(S, s, 2, z, U.shoulder, U_MAX);

export interface Arch {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}
export const ARCHES: readonly Arch[] = [
  { x: X_FA, z: Z_FA, r: ARCH_F },
  { x: X_RA, z: Z_RA, r: ARCH_R },
];

/** The arch over x, if the row passes through one. */
export const archAt = (x: number): Arch | undefined => ARCHES.find((a) => Math.abs(x - a.x) < a.r);

/** u of the arch edge on row s (null when the row is clear of both arches). */
export function archU(S: Surface, s: number): number | null {
  // In the nose / tail caps a row is not at one x: test the side, lower and rocker lines and
  // take the one deepest inside an arch, so the arch's vertical edges stay clear all the way down.
  const r = S.row(s);
  let x = r(U.side)[0];
  let best = Infinity;
  for (const u of [U.side, U.lower, U.rocker]) {
    const xu = r(u)[0];
    const a0 = archAt(xu);
    const d = a0 ? Math.abs(xu - a0.x) : Infinity;
    if (d < best) {
      best = d;
      x = xu;
    }
  }
  const a = archAt(x);
  if (!a) return null;
  const z = a.z + Math.sqrt(Math.max(0, a.r * a.r - (x - a.x) ** 2));
  return uAtZ(S, s, z);
}

/** Cockpit opening half-width at x (0 outside it): straight sides, round rear corners. */
export function cockpitY(x: number): number {
  const front = X_COWL;
  const rear = X_COCKPIT_REAR;
  if (x <= rear || x >= front + 0.02) return 0;
  const w = 0.715;
  const rc = 0.16;
  if (x < rear + rc) {
    const t = (x - rear) / rc;
    return w * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
  }
  return w;
}

/** u of the cockpit edge on row s (0 when the row has no opening). */
export function cockpitU(S: Surface, s: number, x: number): number {
  const y = cockpitY(x);
  return y > 0 ? uAtY(S, s, y) : 0;
}

/** Uniform rows s0..s1 at ≈step metres, plus the given extra s values (sorted, unique). */
export function rows(
  s0: number,
  s1: number,
  step: number,
  extra: readonly number[] = [],
): number[] {
  const n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / step));
  const out = new Set<number>();
  for (let i = 0; i <= n; i++) out.add(s0 + ((s1 - s0) * i) / n);
  for (const e of extra) if (e > Math.min(s0, s1) && e < Math.max(s0, s1)) out.add(e);
  return [...out].sort((a, b) => a - b);
}

/** Row s values hugging both edges of every arch inside [s0, s1] (middle section only). */
export const archEdges = (pad = 0.0015, inner = 12): number[] =>
  ARCHES.flatMap((a) => [
    ...[a.x - a.r - pad, a.x - a.r + pad, a.x + a.r - pad, a.x + a.r + pad].map((x) => sAtX(x, 5)),
    // Rows across the arch so even the far LOD keeps a round opening.
    ...Array.from({ length: inner - 1 }, (_, k) =>
      sAtX(a.x - a.r * Math.cos(((k + 1) / inner) * Math.PI), 5),
    ),
  ]);

export const pointAt = (S: Surface, s: number, u: number): Vec3 => S.row(s)(u);
