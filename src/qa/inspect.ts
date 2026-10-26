// Inspector: geometry queries over a compiled asset in world space, for checks, scripts and
// agents ("how far is the track from the hull?", "does the wheel sink into the fender?").
// Part selectors are names or globs: 'track_l_*', 'road_wheel_*_3', '*_hatch'.

import {
  type Bounds,
  boundsOf,
  type CompiledAsset,
  type Mesh,
  merge,
  worldMeshes,
} from '../core/index.ts';
import { surfaceSamples, TriangleGrid } from './geometry.ts';
import { SolidIndex } from './inside.ts';

export const glob = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replaceAll('?', '.')}$`,
  );

export interface Penetration {
  /** Deepest sampled point of A inside B's solid, metres (0 = none). */
  readonly depth: number;
  readonly samples: number;
}

export interface Inspector {
  readonly asset: CompiledAsset;
  parts(selector: string): string[];
  mesh(selector: string): Mesh | null;
  bounds(selector: string): Bounds | null;
  /** Smallest surface-to-surface distance (0 when touching or intersecting), capped at `max`. */
  distance(a: string, b: string, max?: number): number;
  /** How deep A's surface goes inside B's closed solid. */
  penetration(a: string, b: string): Penetration;
}

export function inspect(asset: CompiledAsset): Inspector {
  const world = worldMeshes(asset.parts);
  const parts = (sel: string): string[] => [...world.keys()].filter((n) => glob(sel).test(n));
  // Checks ask about the same parts over and over: build each merged mesh and index once.
  const meshes = new Map<string, Mesh | null>();
  const grids = new Map<string, TriangleGrid>();
  const solids = new Map<string, SolidIndex>();
  const samples = new Map<string, ReturnType<typeof surfaceSamples>>();
  const mesh = (sel: string): Mesh | null => {
    if (!meshes.has(sel)) {
      const ms = parts(sel).flatMap((n) => world.get(n) ?? []);
      meshes.set(sel, ms.length ? merge(ms) : null);
    }
    return meshes.get(sel) ?? null;
  };
  const cached = <T>(map: Map<string, T>, key: string, make: () => T): T => {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    map.set(key, v);
    return v;
  };
  const near = (a: Bounds, b: Bounds, eps: number): boolean =>
    [0, 1, 2].every(
      (k) => (a.min[k] ?? 0) <= (b.max[k] ?? 0) + eps && (b.min[k] ?? 0) <= (a.max[k] ?? 0) + eps,
    );
  return {
    asset,
    parts,
    mesh,
    bounds: (sel) => {
      const m = mesh(sel);
      return m ? boundsOf(m) : null;
    },
    distance(a, b, max = 1) {
      const ma = mesh(a);
      const mb = mesh(b);
      if (!ma || !mb || !near(boundsOf(ma), boundsOf(mb), max)) return max;
      const grid = cached(grids, b, () => new TriangleGrid(mb));
      const pts = cached(samples, a, () => surfaceSamples(ma, 0.05, 8));
      // Grow the search radius: "do they touch?" is answered at 2 cm without scanning metres.
      for (const r of [0.02, 0.1, 0.5, max].filter((x) => x <= max)) {
        let best = Infinity;
        for (const p of pts) best = Math.min(best, grid.nearest(p, Math.min(r, best)));
        if (best <= r) return best;
      }
      return max;
    },
    penetration(a, b) {
      const ma = mesh(a);
      const mb = mesh(b);
      if (!ma || !mb) return { depth: 0, samples: 0 };
      const bb = boundsOf(mb);
      if (!near(boundsOf(ma), bb, 0)) return { depth: 0, samples: 0 };
      const grid = cached(grids, b, () => new TriangleGrid(mb));
      const solid = cached(solids, b, () => new SolidIndex(mb));
      let depth = 0;
      let count = 0;
      for (const p of cached(samples, `${a}#pen`, () => surfaceSamples(ma, 0.1, 3))) {
        if (!near({ min: p, max: p }, bb, 0) || !solid.inside(p)) continue;
        count++;
        depth = Math.max(depth, grid.nearest(p, 0.5));
      }
      return { depth, samples: count };
    },
  };
}
