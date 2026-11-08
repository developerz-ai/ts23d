// The ruler: measure a compiled asset in world space, metres — overall size, a part's bounds, the
// distance between two parts (centre to centre or surface to surface), the gap between them and
// a cross-section. Read-only queries for recipe tests, scripts and agents:
//   const r = ruler(compile(knight));
//   r.size()                                   → { length, width, height }
//   r.between('hand_r', 'sword', 'closest')    → 0 (it holds it)
//   r.section('forearm_r', { at: wrist, normal: [1, 0, 0] })?.width
// Selectors: an exact name, a prefix ('hand' covers 'hand_palm'), or a glob ('wheel_*').

import {
  type Bounds,
  boundsOf,
  type CompiledAsset,
  type Mesh,
  merge,
  type Plane,
  picks,
  type Section,
  section,
  type Vec3,
  worldMeshes,
} from '../core/index.ts';
import { surfaceSamples, TriangleGrid } from './geometry.ts';

export interface Size {
  /** Along X (front-back). */
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export interface Ruler {
  /** World bounds of the parts `sel` picks, or of the whole asset; null when nothing matches. */
  bounds(sel?: string): Bounds | null;
  /** Overall L × W × H of the asset (or of `sel`). */
  size(sel?: string): Size | null;
  /** 'centre': distance between bound centres · 'closest': surface to surface (0 = touching). */
  between(a: string, b: string, mode?: 'centre' | 'closest'): number | null;
  /** Clearance between two parts' surfaces: 0 when they touch or overlap. Capped at `max`. */
  gap(a: string, b: string, max?: number): number | null;
  /** The cut of `sel` by `plane`: width, depth, area, centroid. Null when the plane misses. */
  section(sel: string, plane: Plane): Section | null;
  /** The part names a selector matches. */
  parts(sel: string): string[];
}

export function ruler(asset: CompiledAsset): Ruler {
  const world = worldMeshes(asset.parts);
  const names = [...world.keys()];
  const merged = new Map<string, Mesh | null>();
  const mesh = (sel: string | undefined): Mesh | null => {
    const key = sel ?? '*';
    if (!merged.has(key)) {
      const ms = names
        .filter((n) => sel === undefined || picks(sel, n))
        .flatMap((n) => world.get(n) ?? []);
      merged.set(key, ms.length ? merge(ms) : null);
    }
    return merged.get(key) ?? null;
  };
  const bounds = (sel?: string): Bounds | null => {
    const m = mesh(sel);
    return m ? boundsOf(m) : null;
  };
  const centre = (b: Bounds): Vec3 => [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
  const gap = (a: string, b: string, max = 1): number | null => {
    const ma = mesh(a);
    const mb = mesh(b);
    return ma && mb ? surfaceDistance(ma, mb, max) : null;
  };
  return {
    bounds,
    size(sel) {
      const b = bounds(sel);
      return b
        ? { length: b.max[0] - b.min[0], width: b.max[1] - b.min[1], height: b.max[2] - b.min[2] }
        : null;
    },
    between(a, b, mode = 'centre') {
      const ba = bounds(a);
      const bb = bounds(b);
      if (!ba || !bb) return null;
      if (mode === 'closest') return gap(a, b, Number.POSITIVE_INFINITY);
      const [p, q] = [centre(ba), centre(bb)];
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    },
    gap,
    section(sel, plane) {
      const m = mesh(sel);
      return m ? section(m, plane) : null;
    },
    parts: (sel) => names.filter((n) => picks(sel, n)),
  };
}

/** Smallest surface-to-surface distance (sampled both ways), capped at `max`. */
function surfaceDistance(ma: Mesh, mb: Mesh, max: number): number {
  const [ba, bb] = [boundsOf(ma), boundsOf(mb)];
  const boxGap = Math.hypot(
    ...[0, 1, 2].map((k) =>
      Math.max(0, (ba.min[k] ?? 0) - (bb.max[k] ?? 0), (bb.min[k] ?? 0) - (ba.max[k] ?? 0)),
    ),
  );
  if (boxGap >= max) return max;
  // Box gap is a lower bound; the box corners' distance an upper one for the search radius.
  const reach = Math.min(
    max,
    Math.hypot(
      ...[0, 1, 2].map(
        (k) => Math.max(ba.max[k] ?? 0, bb.max[k] ?? 0) - Math.min(ba.min[k] ?? 0, bb.min[k] ?? 0),
      ),
    ),
  );
  let best = reach;
  for (const [from, to] of [
    [ma, mb],
    [mb, ma],
  ] as const) {
    const grid = new TriangleGrid(to);
    for (const p of surfaceSamples(from, 0.02, 12)) best = Math.min(best, grid.nearest(p, best));
  }
  return Math.min(best, max);
}
