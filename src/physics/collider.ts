// One collider per exported pivot: the requested shape, or for `auto` the tightest implicit
// shape (box / sphere / capsule / cylinder) unless it overshoots the convex hull by more than
// AUTO_CONVEX_RATIO, then a vertex-capped convex hull. Flat parts get a thin box.

import type { Mesh, Part } from '../core/index.ts';
import { type BoxFit, fitBox, fitRound, fitSphere, type RoundFit, type SphereFit } from './fit.ts';
import { type Hull, hullVolume } from './hull.ts';
import { cappedHull, pointsOf } from './hull-cap.ts';

type ColliderKind = NonNullable<Part['collider']>;

export interface ConvexFit {
  readonly kind: 'convex';
  readonly hull: Hull;
  readonly volume: number;
}
export interface MeshFit {
  readonly kind: 'mesh';
  readonly volume: number;
}
export type Collider = BoxFit | SphereFit | RoundFit | ConvexFit | MeshFit;

/** Collider volume ÷ hull volume above which `auto` gives up on implicit shapes. */
export const AUTO_CONVEX_RATIO = 1.25;
/** Hull vertex cap (Unreal/PhysX cook ≤ 255; Godot and Jolt prefer small hulls). */
export const HULL_MAX_VERTICES = 64;

export interface ColliderFit {
  readonly collider: Collider;
  /** Collider volume ÷ convex-hull volume (1 = perfect; Infinity for flat parts). */
  readonly ratio: number;
}

/** Fit `kind` to a mesh in its own frame; null for 'none' or an empty mesh. */
export function fitCollider(
  mesh: Mesh,
  kind: ColliderKind = 'auto',
  maxVertices = HULL_MAX_VERTICES,
): ColliderFit | null {
  if (kind === 'none' || mesh.indices.length === 0) return null;
  const points = pointsOf(mesh.positions);
  const hull = cappedHull(points, maxVertices);
  const hv = hull ? hullVolume(hull) : 0;
  const ratioOf = (v: number): number => (hv > 0 ? v / hv : Number.POSITIVE_INFINITY);
  if (kind === 'mesh') return { collider: { kind: 'mesh', volume: hv }, ratio: 1 };
  if (kind === 'convex' && hull)
    return { collider: { kind: 'convex', hull, volume: hv }, ratio: 1 };
  const box = fitBox(points);
  if (kind === 'box' || kind === 'convex') return { collider: box, ratio: ratioOf(box.volume) };
  if (kind === 'sphere') {
    const s = fitSphere(points, box);
    return { collider: s, ratio: ratioOf(s.volume) };
  }
  if (kind === 'capsule' || kind === 'cylinder') {
    const r = fitRound(points, box, kind);
    return { collider: r, ratio: ratioOf(r.volume) };
  }
  // auto: implicit shapes in a fixed preference order; a later one must be 2 % smaller to win
  // (a capped cylinder stays a cylinder, not a capsule 1.6 % bigger).
  const best = [
    box,
    fitSphere(points, box),
    fitRound(points, box, 'cylinder'),
    fitRound(points, box, 'capsule'),
  ].reduce((a, b) => (b.volume < a.volume * 0.98 ? b : a));
  if (hull && ratioOf(best.volume) > AUTO_CONVEX_RATIO)
    return { collider: { kind: 'convex', hull, volume: hv }, ratio: 1 };
  return { collider: best, ratio: ratioOf(best.volume) };
}
