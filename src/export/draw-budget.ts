// What one compiled LOD comes to in the GLB `toGlb` writes (default options): draw calls,
// triangles, and whether its parts' motion makes a `run` clip; plus the `budget.draws` check.
// All three exist only after the per-pivot merge and the optimiser the GLB writer runs, so they
// are counted here, on the same merged + optimised parts: a merged mesh left without triangles is
// no draw, a degenerate or duplicate triangle is not in the file, a belt that cannot loop does
// not run. `t3d build`, the manifest and the testing module's `assertQaPass` read these (the
// finding has the shape of a QA `Finding`, which export cannot import: same tier).

import type { Asset, CompiledAsset } from '../core/index.ts';
import { mergeToPivots } from './merge-pivots.ts';
import { optimizeParts } from './optimize-parts.ts';
import { treadMorphs } from './tread-morphs.ts';

export interface DrawFinding {
  readonly gate: 'draw-calls';
  readonly code: 'T3D_QA_DRAW_CALLS';
  readonly message: string;
  readonly fix: string;
}

/** One LOD as the GLB holds it. */
export interface GlbContents {
  /** Primitives: one per merged mesh that still has triangles. */
  readonly draws: number;
  /** Triangles after the optimiser dropped degenerate and duplicate ones. */
  readonly triangles: number;
  /** A `run` clip is written (with animations on): some part's motion gives it a channel. */
  readonly run: boolean;
}

const known = new WeakMap<CompiledAsset, GlbContents>();

/**
 * The parts as `toGlb` writes them: merged to pivots (glowing parts in their own emissive layer,
 * every texture set in its own), then welded. Vertex order does not change a count, so the
 * cache reordering is skipped.
 */
export function glbContents(l: CompiledAsset): GlbContents {
  const hit = known.get(l);
  if (hit) return hit;
  const merged = mergeToPivots(
    l,
    (l.glow ?? []).map((g) => g.parts),
  );
  const { asset, report } = optimizeParts(merged, { vertexCache: false });
  const drawn = asset.parts.filter((p) => p.mesh && p.mesh.indices.length > 0);
  const made: GlbContents = {
    draws: drawn.length,
    triangles: report.trianglesAfter,
    // hierarchy.ts: a tread runs by morph targets when `treadMorphs` can loop it, every other
    // motion by node channels.
    run:
      asset.parts.some((p) => p.motion && p.motion.kind !== 'tread') ||
      drawn.some((p) => p.motion?.kind === 'tread' && treadMorphs(asset.parts, p, l.lod) !== null),
  };
  known.set(l, made);
  return made;
}

/** Draw calls of a LOD: a texture set costs one more draw on each pivot that uses it. */
export const drawCallsOf = (l: CompiledAsset): number => glbContents(l).draws;

/** `budget.draws` exceeded at a LOD → one finding. */
export function drawFindings(asset: Asset, lods: readonly CompiledAsset[]): DrawFinding[] {
  const max = asset.budget.draws;
  if (max === undefined) return [];
  return lods.flatMap((l): DrawFinding[] => {
    const n = drawCallsOf(l);
    return n > max
      ? [
          {
            gate: 'draw-calls',
            code: 'T3D_QA_DRAW_CALLS',
            message: `LOD${l.lod} needs ${n} draw calls, budget.draws is ${max}`,
            fix: 'give parts that move together one pivot (ctx.group) and share paint slots, so the export merges them; or raise budget.draws',
          },
        ]
      : [];
  });
}
