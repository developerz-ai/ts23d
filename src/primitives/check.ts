// Input guards shared by primitives: every bad option throws T3D_RECIPE_INVALID with the fix, so
// an agent reads what to change instead of debugging NaN geometry downstream.

import { cross, length, Ts23dError, type Vec3 } from '../core/index.ts';

export function invalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
}

const finite = (v: Vec3): boolean => v.every(Number.isFinite);

/** Two edge vectors spanning a real parallelogram; returns |u|, |v| and the unit normal u×v. */
export function spanOf(
  what: string,
  origin: Vec3,
  u: Vec3,
  v: Vec3,
): { lu: number; lv: number; n: Vec3 } {
  if (!finite(origin) || !finite(u) || !finite(v))
    invalid(`${what}: origin/u/v has a NaN or Infinity`, 'pass finite metre vectors');
  const lu = length(u);
  const lv = length(v);
  if (lu < 1e-9 || lv < 1e-9)
    invalid(
      `${what}: edge u (${lu} m) or v (${lv} m) has zero length`,
      'give u and v the face edges in metres, both non-zero (e.g. u: [4, 0, 0], v: [0, 0, 3])',
    );
  const c = cross(u, v);
  const lc = length(c);
  if (lc < 1e-6 * lu * lv)
    invalid(
      `${what}: u and v are parallel, so the face has no area`,
      'make v perpendicular to u (u along the face, v up it)',
    );
  return { lu, lv, n: [c[0] / lc, c[1] / lc, c[2] / lc] };
}

/** An integer count in [min, max]. */
export function count(what: string, n: number, min: number, max: number): number {
  if (!Number.isInteger(n) || n < min || n > max)
    invalid(`${what} is ${n}`, `use a whole number from ${min} to ${max}`);
  return n;
}

/** A 2D profile of finite points, at least `min` of them. */
export function profileOf<P extends readonly number[]>(
  what: string,
  profile: readonly P[],
  min: number,
): readonly P[] {
  if (profile.length < min)
    invalid(`${what} has ${profile.length} point(s)`, `give at least ${min} points`);
  const bad = profile.findIndex((p) => !p.every(Number.isFinite));
  if (bad >= 0) invalid(`${what} point ${bad} has a NaN or Infinity`, 'pass finite metre values');
  return profile;
}

/** A finite number > 0. */
export function positive(what: string, n: number, example: string): number {
  if (!Number.isFinite(n) || n <= 0) invalid(`${what} is ${n}`, `use a length > 0 m (${example})`);
  return n;
}

/**
 * `o.color` is an RGB triple of finite numbers. A missing or misspelt colour (`colour: wood`)
 * otherwise surfaces as a spread TypeError deep in the mesh builder; option keys the primitive
 * does not know are named, since a typo is the usual cause. Only reads `known` on failure.
 */
export function colorOf<O extends object>(what: string, o: O, known: Record<keyof O, true>): void {
  const c: unknown = (o as { color?: unknown }).color;
  if (Array.isArray(c) && c.length === 3 && c.every(Number.isFinite)) return;
  const stray = Object.keys(o).filter((k) => !Object.hasOwn(known, k));
  const got = c === undefined ? 'is missing' : `is ${JSON.stringify(c)}, not 3 finite numbers`;
  const named = stray.length ? ` (unknown option ${stray.map((k) => `'${k}'`).join(', ')})` : '';
  invalid(
    `${what} color ${got}${named}`,
    `give ${what} color: hex('#7a5530')${stray.length ? `; rename ${stray.map((k) => `'${k}'`).join(', ')} if it was meant as color` : ''}`,
  );
}
