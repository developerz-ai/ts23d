// Mass moments: zeroth (mass), first (Σ m·x) and second (∫ x xᵀ dm) about the origin, for solid
// tetrahedra fanned from the origin (signed: closed shells sum to the enclosed solid) and for thin
// triangle sheets. Closed forms from Blow & Binstock, "How to find the inertia tensor (or other
// mass properties) of a 3D solid body represented by a triangle mesh" (2004).

import type { Vec3 } from '../core/index.ts';
import type { Mat3 } from './linalg.ts';

export interface Moments {
  mass: number;
  /** Σ m·x (divide by mass for the centre of mass). */
  first: [number, number, number];
  /** ∫ x xᵀ dm, row-major 3×3. */
  second: [number, number, number, number, number, number, number, number, number];
}

export const emptyMoments = (): Moments => ({
  mass: 0,
  first: [0, 0, 0],
  second: [0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const AX = [0, 1, 2] as const;

/** Σ v vᵀ + S Sᵀ over the three vertices (S = a + b + c), scaled by `k`, added into `m`. */
function addSecond(m: Moments, a: Vec3, b: Vec3, c: Vec3, k: number): void {
  const s = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
  for (const i of AX)
    for (const j of AX) {
      const v = a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + (s[i] ?? 0) * (s[j] ?? 0);
      m.second[i * 3 + j] = (m.second[i * 3 + j] ?? 0) + k * v;
    }
}

/** Solid tetrahedron (origin, a, b, c) of density ρ; signed by orientation. Returns its volume. */
export function addTetra(m: Moments, a: Vec3, b: Vec3, c: Vec3, rho: number): number {
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  const vol = det / 6;
  m.mass += rho * vol;
  for (const i of AX) m.first[i] = (m.first[i] ?? 0) + (rho * vol * (a[i] + b[i] + c[i])) / 4;
  addSecond(m, a, b, c, (rho * det) / 120);
  return vol;
}

/** Thin triangle sheet of areal density σ (kg/m²). Returns its area. */
export function addSheet(m: Moments, a: Vec3, b: Vec3, c: Vec3, sigma: number): number {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const area =
    Math.hypot(
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ) / 2;
  m.mass += sigma * area;
  for (const i of AX) m.first[i] = (m.first[i] ?? 0) + (sigma * area * (a[i] + b[i] + c[i])) / 3;
  addSecond(m, a, b, c, (sigma * area) / 12);
  return area;
}

/** `into += k · from`. */
export function accumulate(into: Moments, from: Moments, k = 1): void {
  into.mass += k * from.mass;
  for (let i = 0; i < 3; i++) into.first[i] = (into.first[i] ?? 0) + k * (from.first[i] ?? 0);
  for (let i = 0; i < 9; i++) into.second[i] = (into.second[i] ?? 0) + k * (from.second[i] ?? 0);
}

/** Centre of mass and the inertia tensor about it (kg·m²). */
export function inertiaAboutCom(m: Moments): { com: Vec3; inertia: Mat3 } {
  if (m.mass <= 0)
    return {
      com: [0, 0, 0],
      inertia: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    };
  const com: Vec3 = [m.first[0] / m.mass, m.first[1] / m.mass, m.first[2] / m.mass];
  const p = (i: number, j: number): number =>
    (m.second[i * 3 + j] ?? 0) - m.mass * (com[i] ?? 0) * (com[j] ?? 0);
  const tr = p(0, 0) + p(1, 1) + p(2, 2);
  const row = (i: number): Vec3 => [
    (i === 0 ? tr : 0) - p(i, 0),
    (i === 1 ? tr : 0) - p(i, 1),
    (i === 2 ? tr : 0) - p(i, 2),
  ];
  return { com, inertia: [row(0), row(1), row(2)] };
}
