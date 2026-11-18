// One chain's sweep before any weld: the skin point at (u, angle) and the grid of rings the mesh is
// built from, with the normals a fillet reads. The mesh and `kit.surface` both come through here, so
// detail lands where the skin really is.

import type { Vec3 } from '../core/index.ts';
import type { ChainCopy, ChainCurve } from './body-plan-curve.ts';
import type { BodyPlanLook, Lod } from './body-plan-mesh.ts';
import type { ChainSpec, SurfacePoint } from './body-plan-types.ts';
import { gridNormals } from './body-plan-weld.ts';
import { v3 } from './creature-curve.ts';

/** Root flare: extra radius at the joint. */
const FLARE = 0.35;
/** A chain end under this share of the chain's widest radius closes on a point. */
export const POINT_END = 0.06;
const MIN_RING = 0.001;
/** `antiFold`: how much of the local bend radius a section may reach toward the inside. */
const INSIDE_REACH = 0.42;

export interface Sweep {
  readonly c: ChainSpec;
  readonly curve: ChainCurve;
  readonly copy: ChainCopy;
  readonly flareU: number;
  readonly look: BodyPlanLook;
  readonly lod: Lod;
  /** World point the root closes on (a child: on its parent's bone), or null. */
  readonly anchor: Vec3 | null;
}

export interface SkinGrid {
  readonly stops: readonly number[];
  readonly pts: readonly (readonly SurfacePoint[])[];
  readonly moved: Vec3[][];
  readonly normals: Vec3[][];
}

export const flareOf = (s: Sweep, u: number): number =>
  s.flareU > 0 && u < s.flareU ? 1 + FLARE * (1 - u / s.flareU) ** 2 : 1;

/** The section offset, shortened on the inside of a bend tighter than it can follow. */
function keptOutside(curve: ChainCurve, u: number, offset: Vec3): Vec3 {
  // Wide enough to read the bend, not the curve's sampling steps.
  const h = 0.04;
  const [lo, hi] = [Math.max(0, u - h), Math.min(1, u + h)];
  const turn = v3.mul(v3.sub(curve.at(hi).t, curve.at(lo).t), 1 / ((hi - lo) * curve.length));
  const reach = v3.dot(turn, offset);
  if (reach <= 1e-6) return offset;
  // A soft limit: a hard one would leave a kink along the line where it starts to bite.
  return v3.mul(offset, (INSIDE_REACH * (1 - Math.exp(-reach / INSIDE_REACH))) / reach);
}

/** The skin point at (u, angle) before relief, with its shading normal. */
export function skinPoint(s: Sweep, u: number, angle: number, eps: number): SurfacePoint {
  const { c, curve, copy } = s;
  const flatten = c.flatten ?? 1;
  const radius = (x: number): number => curve.at(x).r * flareOf(s, x);
  const q = curve.at(u);
  const r = Math.max(MIN_RING, radius(u));
  const slope = (radius(u + eps) - radius(u - eps)) / (2 * eps * curve.length);
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  const round = v3.add(v3.mul(q.bend, cos * r * flatten), v3.mul(q.pitch, sin * r));
  const out = c.antiFold ? keptOutside(curve, u, round) : round;
  const shade = v3.add(v3.mul(q.bend, cos / flatten), v3.mul(q.pitch, sin));
  return {
    u,
    angle,
    s: u * curve.length,
    radius: r,
    chain: copy.id,
    lod: s.lod,
    p: copy.point(v3.add(q.p, out)),
    n: copy.dir(v3.norm(v3.sub(shade, v3.mul(q.t, slope)))),
  };
}

/** The slope step of a sweep over these rings: mesh and seating must read the same slope. */
export const slopeStep = (stops: readonly number[]): number => 0.5 / Math.max(1, stops.length * 8);

/** The skin at `q` with relief applied. */
export const reliefPoint = (c: ChainSpec, q: SurfacePoint): Vec3 =>
  c.relief ? v3.add(q.p, v3.mul(q.n, c.relief(q))) : q.p;

/** The rings of a sweep before any weld: points, moved positions and the normals a weld reads. */
export function skinGrid(s: Sweep, stops: readonly number[], sides: number): SkinGrid {
  const { c, curve } = s;
  const widest = Math.max(...c.radius);
  const pointy = (u: number): boolean => curve.at(u).r * flareOf(s, u) < widest * POINT_END;
  const inner = stops.filter((u, i) => !((i === 0 || i === stops.length - 1) && pointy(u)));
  const kept = inner.length > 0 ? inner : [0.5];
  const eps = slopeStep(stops);
  const pts = kept.map((u) =>
    Array.from({ length: sides + 1 }, (_, j) => skinPoint(s, u, (j / sides) * Math.PI * 2, eps)),
  );
  const moved = pts.map((row) => row.map((q) => reliefPoint(c, q)));
  // Relief and antiFold both move the skin off its ellipse: shade what is really there.
  const normals =
    c.relief || c.antiFold ? gridNormals(pts, moved, sides) : pts.map((row) => row.map((q) => q.n));
  return { stops: kept, pts, moved, normals };
}
