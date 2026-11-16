// A garment as one sculpt edit: the body it lies on pushed out by the cloth's thickness, kept
// inside its region, with the tailoring a real garment has — a rolled hem (the edge thicker than
// the panel and rounded, so an opening shows its layer instead of melting into the one below), a
// stitch groove a set distance in from the edge, and folds (cloth-folds.ts) raising and sinking
// the thickness. The field is divided by its slope bound so the mesher's culling stays exact.
// `edgeBand` gives paint fields for trims, stitching and edge wear measured in from the edge.

import type { Field, SculptEdit } from '@developerz.ai/ts23d';
import type { FoldField } from './cloth-folds.ts';
import type { V } from './kit.ts';

export interface Cloth {
  /** The body the garment lies on (signed distance, ≤ 0 inside). */
  readonly body: Field;
  /** Panel thickness, metres. */
  readonly thick: number;
  /** Where the garment is: ≤ 0 inside, ≈ distance to its edge (1-Lipschitz). */
  readonly region: Field;
  /** Nothing below this height (the bust's flat base). */
  readonly floor?: number;
  /** Rolled hem: `lift` metres extra thickness over `width` metres in from the edge, the edge
   *  rounded with radius `roll`. */
  readonly hem?: { readonly width: number; readonly lift: number; readonly roll: number };
  /** Stitch groove `at` metres in from the edge, `depth` deep, `width` half-wide. */
  readonly stitch?: { readonly at: number; readonly depth: number; readonly width: number };
  readonly folds?: FoldField;
  /** An edge the cloth thins out toward instead of ending in a hem (a mantle gathered under a
   *  collar): ≤ 0 inside, thickness eased to 0 over `width` metres in from its edge. */
  readonly feather?: { readonly region: Field; readonly width: number };
  /** A cloak hanging free from the shoulder blades: below `top` the cloth lies on a sheet behind
   *  the back (at x = `x` on the midline at `top`, curving forward `wrap` × y² toward the sides
   *  like the back does, ±`halfY` wide, leaning `lean` metres further back per metre down, kept inside
   *  `within`) instead of following the back's hollows — it stands off the lower back as real
   *  cloth does. */
  readonly drape?: {
    readonly x: number;
    readonly lean: number;
    readonly top: number;
    readonly wrap: number;
    /** Half-width of the sheet, metres (inside the flanks: its sides stay hidden). */
    readonly halfY: number;
    readonly within?: Field;
  };
}

const bump = (u: number): number => (u <= -1 || u >= 1 ? 0 : (1 - u * u) ** 2);
const ease = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Polynomial smooth min (1-Lipschitz). */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** Polynomial smooth max (1-Lipschitz): rounds the cut where cloth meets its edge. */
export function smax(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + (h * h * k) / 4;
}

/** The garment's thickness at p, metres (panel + hem − stitch + folds), and its slope bound. */
export function thickness(c: Cloth): { t: (p: V) => number; lipschitz: number } {
  const hem = c.hem;
  const st = c.stitch;
  const f = c.folds;
  const fe = c.feather;
  const lip =
    (hem ? (hem.lift * 1.54) / hem.width : 0) +
    (st ? (st.depth * 1.54) / st.width : 0) +
    (f ? f.lipschitz : 0);
  // Feathering multiplies t by an ease of slope ≤ 1.5 / width: the product's slope grows by the
  // thickest the cloth gets × that.
  const peak = c.thick + (hem?.lift ?? 0) + (f?.peak ?? 0);
  return {
    lipschitz: lip + (fe ? (peak * 1.5) / fe.width : 0),
    t: (p) => {
      let t = c.thick;
      if (hem || st) {
        const e = -c.region(p);
        if (hem) t += hem.lift * bump(e / hem.width);
        if (st) t -= st.depth * bump((e - st.at) / st.width);
      }
      if (f) t += f.h(p);
      // A gathered edge ends a hair under the skin, so the skin (not a film of cloth) wins there.
      return fe ? t * ease(-fe.region(p) / fe.width) - 0.0003 : t;
    },
  };
}

/** A field remembering its last answer: the layers of one outfit all ask the (costly) body for
 *  the same point in turn, so it is evaluated once per point. Pure: same p, same value. */
export function memo(f: Field): Field {
  let x = Number.NaN;
  let y = Number.NaN;
  let z = Number.NaN;
  let v = 0;
  return (p) => {
    if (p[0] !== x || p[1] !== y || p[2] !== z) {
      x = p[0];
      y = p[1];
      z = p[2];
      v = f(p);
    }
    return v;
  };
}

/** Beyond this distance outside its region a garment answers with the region alone, metres. */
const OUTSIDE = 0.01;

/** The garment's field: ≤ 0 inside the cloth. */
export function clothField(c: Cloth): Field {
  const { t, lipschitz } = thickness(c);
  const d = c.drape;
  // The drape: the wedge between the leaning plane and the body's midplane, under `top`.
  const fill: Field | null = d
    ? (p) => {
        // Slope of the sheet: ≤ hypot(1, lean, 2 · wrap · 0.25) inside a bust (|y| < 25 cm).
        const k = Math.hypot(1, d.lean, 0.5 * d.wrap);
        const sheet = d.x + d.wrap * p[1] * p[1] - d.lean * (d.top - p[2]);
        const box = Math.max((sheet - p[0]) / k, p[0], p[2] - d.top, Math.abs(p[1]) - d.halfY);
        return d.within ? Math.max(box, d.within(p)) : box;
      }
    : null;
  const under: Field = fill ? (p) => smin(c.body(p), fill(p), 0.04) : c.body;
  const k = 1 / (1 + lipschitz);
  const roll = c.hem?.roll ?? 0;
  const floor = c.floor ?? -Infinity;
  const fe = c.feather?.region;
  return (p) => {
    // Clearly outside the garment's region (the head, the face): the region alone is a valid
    // lower bound on the field (smax ≥ max), so the costly body is never asked there.
    const cut = Math.max(c.region(p), floor - p[2], fe ? fe(p) : -Infinity);
    if (cut > OUTSIDE) return cut;
    return Math.max(smax((under(p) - t(p)) * k, c.region(p), roll), cut);
  };
}

/** How a garment or trim edit is placed: its bounds, colour, blend onto what lies under it, and
 *  `mirror: false` for an asymmetric piece (a wrap, a sash) on a mirrored sculpt. */
export interface Place {
  readonly bounds: readonly [V, V];
  readonly color: V;
  readonly blend?: number;
  readonly mirror?: boolean;
}

/** The garment as a sculpt edit. */
export function cloth(c: Cloth, o: Place): SculptEdit {
  return {
    field: clothField(c),
    bounds: o.bounds,
    color: o.color,
    blend: o.blend ?? 0.002,
    ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
  };
}

/** A band `from`…`to` metres in from a region's edge (≤ 0 inside the band): trims, stitching,
 *  edge wear. */
export function edgeBand(region: Field, from: number, to: number): Field {
  const mid = (from + to) / 2;
  const half = (to - from) / 2;
  return (p) => Math.abs(-region(p) - mid) - half;
}

/** A paint edit over a band of a region's edge. */
export function trim(region: Field, from: number, to: number, o: Place): SculptEdit {
  return {
    field: edgeBand(region, from, to),
    bounds: o.bounds,
    op: 'paint',
    color: o.color,
    blend: o.blend ?? 0.002,
    ...(o.mirror === undefined ? {} : { mirror: o.mirror }),
  };
}
