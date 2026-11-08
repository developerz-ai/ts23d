// Which colliders one pivot gets. One shape when it fits; but a convex hull of a mantlet and a
// long barrel is a cone that blocks everything around the gun, so `auto` splits a pivot into a
// compound of its biggest source parts (≤ MAX_PIECES, ≥ 95 % of their hull volume, tiny details
// dropped) when one hull overshoots them by HULL_OVERSHOOT. Static auto hulls become trimeshes.

import type { Mesh } from '../core/index.ts';
import {
  type ColliderFit,
  cappedHull,
  fitCollider,
  HULL_MAX_VERTICES,
  hullVolume,
  pointsOf,
} from '../physics/index.ts';
import type { PivotGeometry } from './physics-pivots.ts';

/** Most colliders one pivot may become. */
export const MAX_PIECES = 8;
/** Pivot hull volume ÷ summed piece hull volumes above which `auto` goes compound. */
export const HULL_OVERSHOOT = 1.6;

export interface ColliderPiece {
  readonly mesh: Mesh;
  readonly fit: ColliderFit;
}

const hullVol = (m: Mesh): number => {
  const h = cappedHull(pointsOf(m.positions), HULL_MAX_VERTICES);
  return h ? hullVolume(h) : 0;
};

function asStatic(fit: ColliderFit, isStatic: boolean): ColliderFit {
  // A static body's auto fallback is its exact trimesh: walk under the water tower, not a blob.
  return isStatic && fit.collider.kind === 'convex'
    ? { collider: { kind: 'mesh', volume: fit.collider.volume }, ratio: 1 }
    : fit;
}

export function colliderPieces(
  g: PivotGeometry,
  isStatic: boolean,
  maxVertices = HULL_MAX_VERTICES,
): ColliderPiece[] {
  const whole = fitCollider(g.mesh, g.collider, maxVertices);
  if (!whole) return [];
  if (g.collider !== 'auto') return [{ mesh: g.mesh, fit: whole }];
  if (isStatic) return [{ mesh: g.mesh, fit: asStatic(whole, true) }];
  if (whole.collider.kind !== 'convex' || g.pieces.length < 2)
    return [{ mesh: g.mesh, fit: whole }];
  const ranked = g.pieces
    .map((mesh, i) => ({ mesh, i, v: hullVol(mesh) }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const total = ranked.reduce((s, p) => s + p.v, 0);
  if (whole.collider.volume <= HULL_OVERSHOOT * total) return [{ mesh: g.mesh, fit: whole }];
  const kept: typeof ranked = [];
  let sum = 0;
  for (const p of ranked) {
    if (kept.length >= MAX_PIECES || sum >= 0.95 * total) break;
    kept.push(p);
    sum += p.v;
  }
  return kept
    .sort((a, b) => a.i - b.i)
    .flatMap((p) => {
      const fit = fitCollider(p.mesh, 'auto', maxVertices);
      return fit ? [{ mesh: p.mesh, fit }] : [];
    });
}
