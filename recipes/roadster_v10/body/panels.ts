// The body's outer panels as regions of the body surface (left half; the caller mirrors): the
// clamshell hood, cowl, front fenders, doors, sills, rear quarters, rear deck with the head
// fairings, trunk lid and the front / rear fascias. Each panel is a thick skin with shut lines
// GAP wide and return flanges, built at the LOD's resolution.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { merge } from '@developerz.ai/ts23d';
import {
  ARCH_F,
  ARCH_R,
  X_COCKPIT_REAR,
  X_COWL,
  X_DOOR_FRONT,
  X_DOOR_REAR,
  X_FA,
  X_RA,
} from '../dims.ts';
import { clamp, len, sub } from '../lib/geo.ts';
import { type ColorFn, patch, type Surface } from '../lib/grid.ts';
import {
  archEdges,
  archU,
  cockpitU,
  cockpitY,
  GAP,
  PANEL_STEP,
  rows,
  sPlus,
  uAtY,
  uPlus,
} from './regions.ts';
import { S_MAX, S_MIN, sAtX, U, U_MAX } from './shape.ts';

export const X_HOOD_REAR = 0.43;
export const X_TRUNK_FRONT = -1.32;
/** Hood front edge (centre line x). */
export const X_HOOD_FRONT = 1.72;
/** Tail fascia / trunk shut line (centre line x). */
export const X_TAIL_SHUT = -2.0;

export interface PanelSpec {
  readonly s0: number;
  readonly s1: number;
  readonly lo: (s: number) => number;
  readonly hi: (s: number) => number;
  /** Shut-line insets (metres of gap on that edge; 0 = no gap there). */
  readonly g?: { s0?: number; s1?: number; lo?: number; hi?: number };
  readonly rims?: { s0?: boolean; s1?: boolean; lo?: boolean; hi?: boolean };
  /** Extra rows to land on (arch edges). */
  readonly extra?: readonly number[];
  /** Columns across, overriding the metre-based count. */
  readonly nu?: number;
  /** Openings cut through the panel (vents, lamp pockets, the mouth). */
  readonly holes?: readonly Hole[];
  /** Offset along the normal (negative = under the skin: liners, pads). */
  readonly lift?: number;
  /** Mesh the panel's back as finely as its face: it is seen when the panel opens (hood, trunk
   *  lid), or an edge steps (the cowl) and coarse back cells would fold across the step. */
  readonly fineInside?: boolean;
  /** Rows spread evenly over this panel instead of on the body-wide grid (the nose and tail
   *  caps, where s is no longer metres along the car). */
  readonly ownRows?: boolean;
}

/**
 * A rounded opening in parameter space: centred at (sc, uc), half-sizes hs (in s) and hu (in u),
 * superellipse exponent n (2 = ellipse, 4+ = rounded rectangle). Holes on one panel must not
 * overlap in u.
 */
export interface Hole {
  readonly sc: number;
  readonly hs: number;
  readonly uc: number;
  readonly hu: number;
  readonly n?: number;
  /** Skew: the hole's u centre moves by `lean` per unit s from sc (a raked vent). */
  readonly lean?: number;
  /** Keep the hole fully open past sc toward this end (a mouth running out to the centre line). */
  readonly open?: 'start' | 'end';
}

/** Half-height factor of a hole at s (0 outside it). */
export function holeG(h: Hole, s: number): number {
  if (h.open === 'end' && s >= h.sc) return 1;
  if (h.open === 'start' && s <= h.sc) return 1;
  const t = Math.abs((s - h.sc) / h.hs);
  if (t >= 1) return 0;
  const n = h.n ?? 4;
  return (1 - t ** n) ** (1 / n);
}

/** Hole u-centre at s. */
export const holeUc = (h: Hole, s: number): number => h.uc + (h.lean ?? 0) * (s - h.sc);

/** Rows that resolve a hole's rounded ends (sine spacing, dense at the tips). */
export function holeRows(h: Hole, k = 24): number[] {
  const out: number[] = [];
  for (let i = -k; i <= k; i++) out.push(h.sc + h.hs * Math.sin((i / k) * (Math.PI / 2)));
  return out;
}

export interface Quality {
  readonly lod: Lod;
  /** Target edge length, metres. */
  readonly step: number;
  readonly thickness: number;
  readonly color: ColorFn;
}

/**
 * Mesh density per LOD. The skin carries analytic normals, so shading stays smooth at any step;
 * the step only has to hold the silhouette: 5 cm chords on the body's 0.3 m+ radii at LOD0 (the
 * sports-car playbook's 40–100k band), 10 cm at LOD1, 30 cm at LOD2.
 */
export const quality = (lod: Lod, color: ColorFn): Quality => ({
  lod,
  step: PANEL_STEP[lod] ?? 0.24,
  thickness: [0.01, 0, 0][lod] ?? 0,
  color,
});

/** Rows per half of a hole's rounded end, per LOD. */
const HOLE_ROWS = [7, 3, 2] as const;
/** Rows across each wheel arch, per LOD. */
const ARCH_ROWS = [14, 8, 4] as const;

/** Mesh one region with gaps applied in metres. */
export function region(S: Surface, spec: PanelSpec, q: Quality): Mesh {
  const g = spec.g ?? {};
  const mid = (spec.lo((spec.s0 + spec.s1) / 2) + spec.hi((spec.s0 + spec.s1) / 2)) / 2;
  const s0 = g.s0 ? sPlus(S, spec.s0, mid, g.s0 / 2) : spec.s0;
  const s1 = g.s1 ? sPlus(S, spec.s1, mid, -g.s1 / 2) : spec.s1;
  const lo = (s: number): number => (g.lo ? uPlus(S, s, spec.lo(s), g.lo / 2) : spec.lo(s));
  const hi = (s: number): number => (g.hi ? uPlus(S, s, spec.hi(s), -g.hi / 2) : spec.hi(s));
  // Rows: metre steps along the panel's middle line, plus any landing rows.
  const r = S.row((s0 + s1) / 2);
  const span = len(sub(S.row(s1)(mid), S.row(s0)(mid)));
  const sStep = (s1 - s0) / Math.max(1, Math.ceil(span / q.step));
  const lattice = spec.ownRows ? 0 : q.step;
  const at = rows(s0, s1, Math.abs(sStep), spec.extra ?? [], lattice);
  let across = 0;
  const a = lo((s0 + s1) / 2);
  const b = hi((s0 + s1) / 2);
  let prev: Vec3 = r(a);
  for (let k = 1; k <= 24; k++) {
    const p = r(a + ((b - a) * k) / 24);
    across += len(sub(p, prev));
    prev = p;
  }
  const nu = spec.nu ?? clamp(Math.ceil(across / q.step), 2, 400);
  // Both panels of a shut line turn their flange along the normal AT the line, not at their own
  // inset edge: over a tight shoulder roll the two edge normals converge and the flanges cross.
  const flangeU = { ...(g.lo ? { lo: spec.lo } : {}), ...(g.hi ? { hi: spec.hi } : {}) };
  const holes = [...(spec.holes ?? [])].sort((x, y) => x.uc - y.uc);
  if (holes.length === 0 || q.lod === 2)
    return patch(S, {
      s0,
      s1,
      ns: at.length - 1,
      sAt: (i) => at[i] ?? s1,
      nu,
      lo: (s) => Math.min(lo(s), hi(s)),
      hi,
      color: q.color,
      strip: 'plastic',
      thickness: q.thickness,
      innerStride: spec.fineInside ? 1 : 2,
      flangeU,
      ...(spec.rims ? { rims: spec.rims } : {}),
      ...(spec.lift ? { lift: spec.lift } : {}),
    });
  // Columns per interval between the holes, proportional to the closed-hole u spans.
  const sm = (s0 + s1) / 2;
  const breaks = [lo(sm), ...holes.map((h) => h.uc), hi(sm)];
  const total = Math.max(1e-6, (breaks[breaks.length - 1] ?? 1) - (breaks[0] ?? 0));
  const counts = breaks
    .slice(1)
    .map((b2, k) => Math.max(2, Math.round((nu * (b2 - (breaks[k] ?? 0))) / total)));
  const skip: number[] = [];
  let acc = 0;
  counts.forEach((c, k) => {
    acc += c;
    if (k < holes.length) skip.push(acc + k);
  });
  const cols = (s: number): number[] => {
    const l = Math.min(lo(s), hi(s));
    const hh = hi(s);
    const edges: number[] = [l];
    for (const h of holes) {
      const g = holeG(h, s);
      const c = holeUc(h, s);
      // Clamped to the row: a hole past the row's end (an arch cut) collapses to nothing.
      edges.push(clamp(c - h.hu * g, l, hh), clamp(c + h.hu * g, l, hh));
    }
    edges.push(hh);
    const out: number[] = [];
    counts.forEach((c, k) => {
      const a2 = edges[2 * k] ?? 0;
      const b2 = edges[2 * k + 1] ?? a2;
      for (let j = 0; j <= c; j++) out.push(a2 + ((b2 - a2) * j) / c);
    });
    return out;
  };
  const rowsAt = rows(
    s0,
    s1,
    Math.abs(sStep),
    [...(spec.extra ?? []), ...holes.flatMap((h) => holeRows(h, HOLE_ROWS[q.lod] ?? 2))],
    lattice,
  );
  return patch(S, {
    s0,
    s1,
    ns: rowsAt.length - 1,
    sAt: (i) => rowsAt[i] ?? s1,
    nu: counts.reduce((x, y) => x + y, 0) + holes.length,
    lo,
    hi,
    cols,
    skip,
    color: q.color,
    strip: 'plastic',
    thickness: q.thickness,
    innerStride: spec.fineInside ? 1 : 2,
    flangeU,
    ...(spec.rims ? { rims: spec.rims } : {}),
  });
}

const sHoodFront = (): number => sAtX(X_HOOD_FRONT, 0);

/** The openings (left half), shared with the parts that fill them (lamps, grille, vents). */
export const HOOD_VENT: Hole = { sc: 1.2, hs: 0.17, uc: 1.62, hu: 0.33, n: 5, lean: 0.4 };
export const HEADLAMP: Hole = { sc: 1.8, hs: 0.1, uc: 3.95, hu: 1.3, n: 5, lean: 2.5 };
export const MOUTH: Hole = { sc: 1.99, hs: 0.11, uc: 7.55, hu: 0.95, n: 4, open: 'end' };
export const TAILLAMP: Hole = { sc: -2.13, hs: 0.115, uc: 6.55, hu: 0.42, n: 6, lean: -1.2 };
export const GILLS: readonly Hole[] = [0, 1, 2].map((k) => ({
  sc: 0.66 - k * 0.025,
  hs: 0.15 - k * 0.012,
  uc: 7.06 + k * 0.24,
  hu: 0.07,
  n: 6,
  lean: -0.25,
}));
const sTail = (): number => sAtX(X_TAIL_SHUT, 0);
/** Deck rows stop where the cockpit corner reaches the valley line. */
const X_DECK_END = -0.823;

export interface BodyPanels {
  readonly hood: Mesh;
  readonly cowl: Mesh;
  readonly fender: Mesh;
  readonly door: Mesh;
  readonly sill: Mesh;
  readonly quarter: Mesh;
  readonly deck: Mesh;
  readonly trunk: Mesh;
  readonly noseFascia: Mesh;
  readonly tailFascia: Mesh;
}

/** Every outer panel, left half. */
export function bodyPanels(S: Surface, q: Quality): BodyPanels {
  const arches = archEdges(0.0015, ARCH_ROWS[q.lod] ?? 4);
  const sh = U.shoulder;
  const hood = region(
    S,
    {
      s0: X_HOOD_REAR,
      s1: sHoodFront(),
      lo: () => 0,
      hi: () => sh,
      g: { s0: GAP, s1: GAP, hi: GAP },
      rims: { lo: false },
      fineInside: true,
      holes: [HOOD_VENT],
    },
    q,
  );
  const cowl = region(
    S,
    {
      s0: X_DOOR_FRONT,
      s1: X_HOOD_REAR,
      lo: (s) => cockpitU(S, s, s),
      hi: () => sh,
      g: { s0: GAP, s1: GAP, hi: GAP },
      rims: { lo: false },
      // The opening's front edge is a step in `lo`: two rows 7 mm apart keep it square.
      extra: [X_COWL + 0.014, X_COWL + 0.021],
      fineInside: true,
    },
    q,
  );
  // Fender in three pieces so no row jumps across an arch edge: behind the arch (gills), over
  // the arch, ahead of it (down to the fascia). The ahead piece starts where the ROCKER line
  // clears the arch (in the nose cap the lower lines run further back than the side line).
  const aFb = sAtX(X_FA - ARCH_F, 5);
  const aFf = sAtX(X_FA + ARCH_F, 7);
  const archRows = arches;
  const fender = merge([
    region(
      S,
      {
        s0: X_DOOR_FRONT,
        s1: aFb,
        lo: () => sh,
        hi: () => U.lower,
        g: { s0: GAP, lo: GAP },
        holes: GILLS,
      },
      q,
    ),
    region(
      S,
      {
        s0: aFb,
        s1: aFf,
        lo: () => sh,
        hi: (s) => archU(S, s) ?? U.lower,
        g: { lo: GAP },
        extra: archRows,
      },
      q,
    ),
    region(
      S,
      { s0: aFf, s1: sHoodFront(), lo: () => sh, hi: () => 9.7, g: { s1: GAP, lo: GAP } },
      q,
    ),
  ]);
  const door = region(
    S,
    {
      s0: X_DOOR_REAR,
      s1: X_DOOR_FRONT,
      lo: (s) => cockpitU(S, s, s),
      hi: () => U.lower,
      g: { s0: GAP, s1: GAP, hi: GAP },
    },
    q,
  );
  const aRb = sAtX(X_RA - ARCH_R, 7);
  const aRf = X_RA + ARCH_R;
  const sill = region(
    S,
    { s0: aRf, s1: X_FA - ARCH_F, lo: () => U.lower, hi: () => U_MAX, g: { lo: GAP } },
    q,
  );
  // Shut line to the trunk lid only; the deck and the quarter are one welded skin.
  const qLo = (s: number): number =>
    s > X_DECK_END
      ? cockpitU(S, s, s)
      : s < X_TRUNK_FRONT
        ? uPlus(S, s, U.valley, GAP / 2)
        : U.valley;
  const quarter = merge([
    region(S, { s0: sTail(), s1: aRb, lo: qLo, hi: () => 9.7, g: { s0: GAP } }, q),
    region(S, { s0: aRb, s1: aRf, lo: qLo, hi: (s) => archU(S, s) ?? U.lower, extra: archRows }, q),
    region(
      S,
      { s0: aRf, s1: X_DOOR_REAR, lo: qLo, hi: () => U.lower, g: { s1: GAP }, extra: [X_DECK_END] },
      q,
    ),
  ]);
  const deck = region(
    S,
    {
      s0: X_TRUNK_FRONT,
      s1: X_DECK_END,
      lo: (s) => (cockpitY(s) > 0 ? cockpitU(S, s, s) : 0),
      hi: () => U.valley,
      g: { s0: GAP },
      rims: { lo: true, hi: false },
      // The cockpit's rear corners are 16 cm rounds: rows where the round turns fastest.
      extra: [0, 0.0025, 0.012, 0.03, 0.06, 0.1].map((d) => X_COCKPIT_REAR + d),
    },
    q,
  );
  const trunk = region(
    S,
    {
      s0: sTail(),
      s1: X_TRUNK_FRONT,
      lo: () => 0,
      hi: () => U.valley,
      g: { s0: GAP, s1: GAP, hi: GAP },
      rims: { lo: false },
      fineInside: true,
    },
    q,
  );
  const noseFascia = region(
    S,
    {
      s0: sHoodFront(),
      s1: S_MAX,
      lo: () => 0,
      hi: () => U_MAX,
      g: { s0: GAP },
      rims: { lo: false, s1: false },
      ownRows: true,
      // The hood valley runs concave into the nose: a coarse back would poke through the face.
      fineInside: true,
      holes: [HEADLAMP, MOUTH],
    },
    q,
  );
  const tailFascia = region(
    S,
    {
      s0: S_MIN,
      s1: sTail(),
      lo: () => 0,
      hi: () => U_MAX,
      g: { s1: GAP },
      rims: { lo: false, s0: false },
      ownRows: true,
      holes: [TAILLAMP],
    },
    q,
  );
  return { hood, cowl, fender, door, sill, quarter, deck, trunk, noseFascia, tailFascia };
}

export const cockpitEdgeU = (S: Surface, s: number): number => cockpitU(S, s, s);
export const COCKPIT = { front: X_COWL, rear: X_COCKPIT_REAR, uAtY };
