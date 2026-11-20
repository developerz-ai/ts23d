// The one rounding every number goes through before it is written into shipped text (the glTF JSON
// inside a GLB, manifest.json). A float64 printed in full carries seventeen digits, most of them
// noise: the last bits of whatever arithmetic produced it. Rounding to a stated precision keeps
// committed text stable and says how exact each file is. Whole numbers (counts, offsets, indices,
// seeds) pass through untouched.

import { pow } from './dmath.ts';

/** `significant` digits in total (9 carry a float32 exactly), or `decimals` after the point. */
export type Rounding = { readonly significant: number } | { readonly decimals: number };

/** glTF JSON: 9 significant digits, so an accessor's float32 min/max reads back to the same float. */
export const GLTF_ROUNDING: Rounding = { significant: 9 };

/** manifest.json: 6 decimals (a micrometre, a millionth of a colour or of a second). */
export const MANIFEST_ROUNDING: Rounding = { decimals: 6 };

/** `v` at the stated precision; whole and non-finite numbers are returned as they are. */
export function roundNumber(v: number, r: Rounding): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return v;
  if ('significant' in r) return Number(v.toPrecision(r.significant));
  const k = pow(10, r.decimals);
  return Math.round(v * k) / k;
}

/** A copy of a JSON value (objects, arrays, numbers, strings …) with every number rounded. */
export function roundJson<T>(value: T, r: Rounding): T {
  if (typeof value === 'number') return roundNumber(value, r) as T;
  if (Array.isArray(value)) return value.map((v) => roundJson(v, r)) as T;
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, roundJson(v, r)])) as T;
  return value;
}

/** The glTF JSON text of a GLB: every number rounded once, here, whoever built the document. */
export const gltfText = (gltf: unknown): string =>
  JSON.stringify(gltf, (_key, v: unknown) =>
    typeof v === 'number' ? roundNumber(v, GLTF_ROUNDING) : v,
  );
