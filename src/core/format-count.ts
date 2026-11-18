// Counts as people read them: 188016 → 188k, 21860 → 21.9k, 1062 → 1.06k, 1234567 → 1.23M. For
// READMEs, reports and the gallery; machine output (JSON, manifests, checks) keeps exact numbers.

import { Ts23dError } from './errors.ts';

const UNITS = ['', 'k', 'M', 'B', 'T'] as const;

/** `n` in three significant digits with k, M, B or T; under 1000 it stays a whole number. */
export function formatCount(n: number): string {
  if (!Number.isFinite(n))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `formatCount got ${n}, not a finite number`,
      fix: 'pass the count itself',
    });
  const sign = n < 0 ? '-' : '';
  let value = Math.abs(n);
  if (value < 1000) return `${sign}${Math.round(value)}`;
  let unit = 0;
  while (unit < UNITS.length - 1 && Number(value.toPrecision(3)) >= 1000) {
    value /= 1000;
    unit++;
  }
  return `${sign}${Number(value.toPrecision(3))}${UNITS[unit]}`;
}
