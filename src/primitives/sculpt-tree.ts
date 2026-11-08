// Sculpt evaluation: the edit list compiled into a tree (groups fold their own edits first) and
// folded per query point. Sparse: every node carries a bounding sphere with a proven lower bound
// on its value, and an edit is skipped only when that bound shows its blend weight would be
// exactly 1 (nothing changes) — so skipping is bit-identical to evaluating, just faster. A weight
// of 1 passes the running value through untouched (no `v + (d − v)` rounding).

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import { type SculptEdit, sculptShape, shapeSphere } from './sculpt-edit.ts';
import { fieldShape } from './sculpt-field.ts';
import type { Field } from './sdf-ops.ts';

const ADD = 0;
const SUB = 1;
const INTER = 2;
const PAINT = 3;
const OPS = { add: ADD, subtract: SUB, intersect: INTER, paint: PAINT } as const;

export interface Node {
  readonly op: number;
  readonly k: number;
  /** The edit's own colour (shapes), or null. */
  readonly color: Vec3 | null;
  readonly shape: Field | null;
  readonly kids: readonly Node[] | null;
  /** Default colour for this group's edits; its scratch colour buffer. */
  readonly base: Vec3;
  readonly rgb: Float64Array;
  // Bound: value ≥ scale · (|p − c| − r) − under outside the sphere (and ≥ |p − c| − r − under
  // inside it when `inside`); `mirror` also tests the sphere mirrored across y = 0.
  readonly c: Vec3;
  readonly r: number;
  readonly scale: number;
  readonly inside: boolean;
  readonly mirror: boolean;
  readonly under: number;
}

export function compile(
  edits: readonly SculptEdit[],
  base: Vec3,
  mirror: boolean,
  path = 'sculpt',
): Node[] {
  if (!edits.some((e) => (e.op ?? 'add') === 'add'))
    invalid(`${path} has no add edits, so nothing to carve from`, "make the first edit op: 'add'");
  return edits.map((e, i): Node => {
    const op = OPS[e.op ?? 'add'];
    const k = e.blend ?? 0;
    const m = e.mirror ?? mirror;
    if ('group' in e) {
      const kids = compile(e.group, e.color ?? base, m, `${path} group ${i}`);
      const b = enclose(kids);
      return node(
        op,
        k,
        e.color ?? null,
        null,
        kids,
        e.color ?? base,
        3,
        b.c,
        b.r,
        b.scale,
        b.inside,
        false,
        b.under,
      );
    }
    if ('field' in e) {
      const f = fieldShape(e.field, e.bounds, m, `${path} edit ${i} (field)`);
      return node(op, k, e.color ?? null, f.shape, null, base, 0, f.c, f.r, 1, true, m, 0);
    }
    const s = shapeSphere(e);
    return node(
      op,
      k,
      e.color ?? null,
      sculptShape(e, i, m),
      null,
      base,
      0,
      s.c,
      s.r,
      s.scale,
      s.inside,
      m,
      0,
    );
  });
}

/** Every node built in one property order: the fold loop stays monomorphic (one hidden class). */
function node(
  op: number,
  k: number,
  color: Vec3 | null,
  shape: Field | null,
  kids: readonly Node[] | null,
  base: Vec3,
  rgb: number,
  c: Vec3,
  r: number,
  scale: number,
  inside: boolean,
  mirror: boolean,
  under: number,
): Node {
  return {
    op,
    k,
    color,
    shape,
    kids,
    base,
    rgb: new Float64Array(rgb),
    c,
    r,
    scale,
    inside,
    mirror,
    under,
  };
}

/** One sphere around all add children (and their mirror copies), scale = the weakest child's. */
function enclose(
  kids: readonly Node[],
): Pick<Node, 'c' | 'r' | 'scale' | 'inside' | 'mirror' | 'under'> {
  const adds = kids.filter((n) => n.op === ADD);
  const spheres = adds.flatMap((n) =>
    n.mirror ? [n, { ...n, c: [n.c[0], -n.c[1], n.c[2]] as Vec3 }] : [n],
  );
  const lo = [0, 1, 2].map((a) => Math.min(...spheres.map((n) => (n.c[a] ?? 0) - n.r)));
  const hi = [0, 1, 2].map((a) => Math.max(...spheres.map((n) => (n.c[a] ?? 0) + n.r)));
  const c: Vec3 = [
    ((lo[0] ?? 0) + (hi[0] ?? 0)) / 2,
    ((lo[1] ?? 0) + (hi[1] ?? 0)) / 2,
    ((lo[2] ?? 0) + (hi[2] ?? 0)) / 2,
  ];
  const r = Math.max(
    ...spheres.map((n) => Math.hypot(n.c[0] - c[0], n.c[1] - c[1], n.c[2] - c[2]) + n.r),
  );
  return {
    c,
    r,
    scale: Math.min(...adds.map((n) => n.scale)),
    inside: adds.every((n) => n.inside),
    mirror: false,
    // Smooth union undershoots the plain min by at most k/4 per blend; children's own undershoot adds.
    under: adds.reduce((u, n) => u + n.k / 4 + n.under, 0),
  };
}

function lowerBound(n: Node, p: Vec3): number {
  const dx = p[0] - n.c[0];
  const dz = p[2] - n.c[2];
  let dy = p[1] - n.c[1];
  let q = dx * dx + dy * dy + dz * dz;
  if (n.mirror) {
    dy = p[1] + n.c[1];
    q = Math.min(q, dx * dx + dy * dy + dz * dz);
  }
  const out = Math.sqrt(q) - n.r;
  if (out > 0) return n.scale * out - n.under;
  return n.inside ? out - n.under : Number.NEGATIVE_INFINITY;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : Math.min(x, 1));
/** Smooth-min weight of `a` against `b` (1 = all a). */
const weight = (a: number, b: number, k: number): number =>
  k > 0 ? clamp01(0.5 + (0.5 * (b - a)) / k) : a < b ? 1 : 0;
/** Margin past which a bound proves the weight is exactly 1, rounding included. */
const slack = (d: number): number => 1e-9 * (1 + Math.abs(d));

/** Fold `nodes` at p; writes the blended colour into `rgb` (seeded with `base`) when given. */
export function fold(
  nodes: readonly Node[],
  p: Vec3,
  rgb: Float64Array | null,
  base: Vec3,
  sparse = true,
): number {
  let d = Number.POSITIVE_INFINITY;
  if (rgb) rgb.set(base);
  for (const n of nodes) {
    const k = n.k;
    if (n.op === PAINT) {
      if (!rgb || !n.color || !n.shape) continue;
      const kk = Math.max(k, 1e-9);
      if (sparse && lowerBound(n, p) > kk / 2 + slack(kk)) continue;
      const w = 1 - clamp01(0.5 - n.shape(p) / kk);
      if (w < 1) mix(rgb, n.color, w);
      continue;
    }
    const empty = d === Number.POSITIVE_INFINITY;
    if (empty && n.op !== ADD) continue;
    if (sparse && !empty) {
      if (n.op === ADD && lowerBound(n, p) > d + k + slack(d)) continue;
      if (n.op === SUB && lowerBound(n, p) > k - d + slack(d)) continue;
    }
    const v = n.kids
      ? fold(n.kids, p, rgb ? n.rgb : null, n.base, sparse)
      : n.shape
        ? n.shape(p)
        : 0;
    let w = 0;
    if (empty) d = v;
    else if (n.op === ADD) {
      w = weight(d, v, k);
      if (w !== 1) d = v + (d - v) * w - k * w * (1 - w);
    } else {
      // subtract = smooth max(d, −v); intersect = smooth max(d, v).
      const b = n.op === SUB ? -v : v;
      w = weight(-d, -b, k);
      if (w !== 1) d = -(-b + (-d + b) * w - k * w * (1 - w));
    }
    if (!rgb || w >= 1) continue;
    if (n.kids) {
      if (n.color || n.op === ADD) mixArr(rgb, n.rgb, w);
    } else if (n.color || n.op === ADD) mix(rgb, n.color ?? base, w);
  }
  return d;
}

const mix = (rgb: Float64Array, c: Vec3, w: number): void => {
  for (let j = 0; j < 3; j++) rgb[j] = (c[j] ?? 0) + ((rgb[j] ?? 0) - (c[j] ?? 0)) * w;
};
const mixArr = (rgb: Float64Array, c: Float64Array, w: number): void => {
  for (let j = 0; j < 3; j++) rgb[j] = (c[j] ?? 0) + ((rgb[j] ?? 0) - (c[j] ?? 0)) * w;
};
