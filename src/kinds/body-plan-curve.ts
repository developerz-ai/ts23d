// The centreline of one body-plan chain: a Catmull-Rom curve through its stations, resampled by arc
// length, carrying the radius and a twist-free frame (`bend`, `pitch`, tangent `t`) that the bones,
// the swept skin and the motion all share. `bend` starts as world up made square to the tangent
// (world +X on a vertical chain) and is carried along by projection, so it never flips; `pitch` is
// t × bend. Also the copy transforms of a repeated chain: a mirror across y = 0, a radial turn.

import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import type { ChainRepeat, ChainSpec } from './body-plan-types.ts';
import { rotate, spline, v3 } from './creature-curve.ts';

/** Curve samples per span between two stations. */
const PER_SPAN = 12;
/** Tangent this close to world up: `bend` starts from +X instead. */
const NEAR_VERTICAL = 0.95;

export interface CurvePoint {
  readonly p: Vec3;
  readonly r: number;
  /** Unit tangent, root → tip. */
  readonly t: Vec3;
  /** Unit axis square to `t`: the main bend axis, and the section's height direction. */
  readonly bend: Vec3;
  /** t × bend: the cross bend axis, and the section's width direction. */
  readonly pitch: Vec3;
}

export interface ChainCurve {
  /** Arc length, metres. */
  readonly length: number;
  /** The curve at arc fraction `u` (0 root, 1 tip). */
  at(u: number): CurvePoint;
}

const square = (v: Vec3, t: Vec3): Vec3 => v3.sub(v, v3.mul(t, v3.dot(v, t)));

/** Radius at station position `x`: Catmull-Rom, held between its two stations (no overshoot). */
function radiusAt(rs: readonly number[], x: number): number {
  const last = rs.length - 1;
  const i = Math.min(Math.floor(x), last - 1);
  const t = x - i;
  const r = (k: number): number => rs[Math.max(0, Math.min(last, k))] ?? 0;
  const [p0, p1, p2, p3] = [r(i - 1), r(i), r(i + 1), r(i + 2)];
  const v =
    0.5 *
    (2 * p1 +
      (p2 - p0) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
  return Math.min(Math.max(p1, p2), Math.max(Math.min(p1, p2), v));
}

function tangents(pts: readonly Vec3[]): Vec3[] {
  const at = (i: number): Vec3 => pts[Math.max(0, Math.min(pts.length - 1, i))] ?? [0, 0, 0];
  return pts.map((_, i) => v3.norm(v3.sub(at(i + 1), at(i - 1))));
}

export function chainCurve(c: ChainSpec): ChainCurve {
  const pts = spline(c.path, PER_SPAN);
  const ts = tangents(pts);
  const first = ts[0] ?? [1, 0, 0];
  const ref: Vec3 = Math.abs(first[2]) > NEAR_VERTICAL ? [1, 0, 0] : [0, 0, 1];
  let bend = v3.norm(square(ref, first));
  const samples: CurvePoint[] = pts.map((p, i) => {
    const t = ts[i] ?? first;
    const carried = square(bend, t);
    if (v3.len(carried) > 1e-6) bend = v3.norm(carried);
    return { p, r: radiusAt(c.radius, i / PER_SPAN), t, bend, pitch: v3.cross(t, bend) };
  });
  const arc = [0];
  for (let i = 1; i < pts.length; i++)
    arc.push((arc[i - 1] ?? 0) + v3.len(v3.sub(pts[i] ?? [0, 0, 0], pts[i - 1] ?? [0, 0, 0])));
  const length = arc[arc.length - 1] ?? 0;
  const at = (u: number): CurvePoint => {
    const want = Math.max(0, Math.min(1, u)) * length;
    let lo = 0;
    let hi = arc.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((arc[mid] ?? 0) <= want) lo = mid;
      else hi = mid;
    }
    const a = samples[lo] as CurvePoint;
    const b = samples[hi] as CurvePoint;
    const span = (arc[hi] ?? 0) - (arc[lo] ?? 0);
    const k = span > 0 ? Math.min(1, (want - (arc[lo] ?? 0)) / span) : 0;
    const t = v3.norm(v3.lerp(a.t, b.t, k));
    const up = v3.norm(square(v3.lerp(a.bend, b.bend, k), t));
    return {
      p: v3.lerp(a.p, b.p, k),
      r: a.r + (b.r - a.r) * k,
      t,
      bend: up,
      pitch: v3.cross(t, up),
    };
  };
  return { length, at };
}

/** Arc fractions of the link joints, root to tip (`links + 1` values): `bias` > 1 packs the tip. */
export function linkStops(links: number, bias = 1): number[] {
  return Array.from({ length: links + 1 }, (_, i) =>
    i === links ? 1 : 1 - dmath.pow(1 - i / links, bias),
  );
}

/** Where one copy of a chain sits relative to the authored path. */
export interface ChainCopy {
  /** The bone prefix (`arm_3`, `fin_l`, `spine`). */
  readonly id: string;
  readonly copy: 'l' | 'r' | number | null;
  point(p: Vec3): Vec3;
  /** A direction (a tangent, a normal). */
  dir(v: Vec3): Vec3;
  /** A rotation axis: under a mirror it flips, so equal angles give mirror-image motion. */
  axis(v: Vec3): Vec3;
  /** The copy is a reflection: triangle winding reverses. */
  readonly flips: boolean;
}

const same = (v: Vec3): Vec3 => v;

function radialCopy(name: string, r: Extract<ChainRepeat, { kind: 'radial' }>, k: number) {
  const angle = (r.start ?? 0) + (2 * Math.PI * k) / r.count;
  const dir = (v: Vec3): Vec3 => rotate(v, r.axis, angle);
  return {
    id: `${name}_${k}`,
    copy: k,
    point: (p: Vec3): Vec3 => v3.add(r.about, dir(v3.sub(p, r.about))),
    dir,
    axis: dir,
    flips: false,
  };
}

/** Every copy of a chain, in bone order: the authored one first. */
export function chainCopies(c: ChainSpec): ChainCopy[] {
  const r = c.repeat;
  if (!r) return [{ id: c.name, copy: null, point: same, dir: same, axis: same, flips: false }];
  if (r.kind === 'radial')
    return Array.from({ length: r.count }, (_, k) => radialCopy(c.name, r, k));
  const flip = (v: Vec3): Vec3 => [v[0], -v[1], v[2]];
  return [
    { id: `${c.name}_l`, copy: 'l', point: same, dir: same, axis: same, flips: false },
    {
      id: `${c.name}_r`,
      copy: 'r',
      point: flip,
      dir: flip,
      axis: (v) => [-v[0], v[1], -v[2]],
      flips: true,
    },
  ];
}
