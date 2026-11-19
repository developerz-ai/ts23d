// Card length per root, checked before any card is built: a NaN length would write NaN positions,
// a negative one grows the card into the skin, and a length near zero leaves a zero-area speck.
// Roots whose length falls under MIN_LENGTH × the card width grow no card at all (a coat fading
// out toward a muzzle or a paw), so the zone's count, roots and mesh always agree.

import { type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { type Root, sample } from './hair-roots.ts';

/** Shortest card worth emitting, as a share of the zone's card width. */
const MIN_LENGTH = 0.1;

/** The length-related part of a card zone. */
export interface LengthZone {
  readonly name: string;
  readonly length: number | ((p: Vec3, n: Vec3) => number);
  readonly width: number;
}

function checked(z: LengthZone, length: number): number {
  if (!(Number.isFinite(length) && length >= 0))
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `hairCards: zone '${z.name}' has a card length of ${length} m`,
      fix: 'length is metres from root to tip, finite and ≥ 0 (0 = no card there): clamp a length function with Math.max(0, …)',
    });
  return length;
}

/** The roots that grow a card and each one's length (before jitter), in root order. */
export function grown(
  surface: Mesh,
  z: LengthZone,
  roots: readonly Root[],
): { readonly list: Root[]; readonly lengths: number[] } {
  const of = z.length;
  if (typeof of === 'number') checked(z, of);
  const at = (r: Root): number => {
    if (typeof of === 'number') return of;
    const s = sample(surface, r.t, r.b1, r.b2);
    return checked(z, of(s.p, s.n));
  };
  const list: Root[] = [];
  const lengths: number[] = [];
  for (const r of roots) {
    const length = at(r);
    if (length < MIN_LENGTH * z.width) continue;
    list.push(r);
    lengths.push(length);
  }
  return { list, lengths };
}
