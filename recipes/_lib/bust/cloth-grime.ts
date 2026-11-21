// Grime on a garment from its causes, never from noise: dirt and wear gather in the valleys of
// its folds and at the feet of its ridges (where the cloth tucks in), creep in from the edges it
// is handled by and drags through (a hem, a cuff, an opening), and soak the spots the body wears
// (an armpit's sweat, a collar's grease). Painted by seeded noise anywhere, stains landed as
// blotches across open panels that read as holes in the texture, not as wear (D580).
// `grime` paints it; `grimeZone` is where it may sit, for the stray-paint check (cloth-check.ts).

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import type { FoldField } from './cloth-folds.ts';
import type { V } from './kit.ts';

/** Why a garment is dirty where it is. */
export interface GrimeCauses {
  /** The garment's folds: grime in the valleys and at the ridges' feet (concave cloth). */
  readonly folds?: FoldField;
  /** Edges it creeps in from: the region (≤ 0 inside) and how far in, metres. */
  readonly edges?: readonly { readonly region: Field; readonly width: number }[];
  /** Spots the body wears: centre and radius, metres (mirrored across y = 0 with the sculpt). */
  readonly spots?: readonly { readonly at: V; readonly r: number }[];
}

/** Sample step of the fold concavity, metres (about a third of a fold's half-width). */
const STEP = 0.006;

/** How concave the folds are at p, metres: the mean height a step around less the height here
 *  (> 0 in a valley and at a ridge's foot, < 0 on a crest). */
export function foldCavity(f: FoldField, p: V): number {
  const e = STEP;
  const [x, y, z] = p;
  const ring =
    f.h([x + e, y, z]) +
    f.h([x - e, y, z]) +
    f.h([x, y + e, z]) +
    f.h([x, y - e, z]) +
    f.h([x, y, z + e]) +
    f.h([x, y, z - e]);
  return ring / 6 - f.h(p);
}

/** The grime mask (≤ 0 where it sits, metres-like): the nearest of its causes. A fold's cavity
 *  counts from a fifth of the folds' height. */
export function grimeMask(c: GrimeCauses): Field {
  const f = c.folds;
  const edges = c.edges ?? [];
  const spots = c.spots ?? [];
  const k = f ? 0.2 * f.peak : 0;
  return (p) => {
    let m = Number.POSITIVE_INFINITY;
    for (const e of edges) m = Math.min(m, -e.region(p) - e.width);
    for (const s of spots)
      m = Math.min(
        m,
        dmath.hypot(p[0] - s.at[0], Math.abs(p[1]) - Math.abs(s.at[1]), p[2] - s.at[2]) - s.r,
      );
    // (Cavity in metres of cloth height, scaled ×4 onto the edges' metres of distance.)
    if (f && f.peak > 0) m = Math.min(m, (k - foldCavity(f, p)) * 4);
    return m;
  };
}

/** Where grime may sit (≤ 0): the mask grown by half its fade (a paint fades over ±fade / 2). */
export function grimeZone(c: GrimeCauses, fade: number): Field {
  const m = grimeMask(c);
  return (p) => m(p) - fade / 2;
}

/** The grime as a paint edit in `color`, fading over `fade` metres of its mask. */
export function grime(
  c: GrimeCauses,
  color: V,
  o: { readonly bounds: readonly [V, V]; readonly fade: number },
): SculptEdit {
  return {
    field: grimeMask(c),
    bounds: o.bounds,
    op: 'paint',
    color,
    blend: o.fade,
    mirror: false,
  };
}
