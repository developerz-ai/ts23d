// Gate: everything is attached. A part is grounded if some surface of it lies within CONTACT_EPS of
// z = 0 (or it straddles z = 0) or its SURFACE comes within CONTACT_EPS of a grounded part's
// surface, transitively. Bounding boxes are only the prefilter. A part wholly below the ground is
// its own finding: sunk geometry is invisible and was counted as grounded before (D36).

import { type Bounds, type CompiledAsset, type Mesh, worldMeshes } from '../core/index.ts';
import { surfaceSamples, type TriangleGrid } from './geometry.ts';
import { meshBounds, triangleGrid } from './geometry-cache.ts';
import { CONTACT_EPS, type Finding, type Gate } from './types.ts';

const CODE = 'T3D_QA_FLOATING_PARTS';
/** Below this box distance the reported gap is the exact surface distance; beyond, the box's. */
const EXACT_GAP = 0.3;
const ANCHOR = 'box and cylinder anchor at their base: `at.z` is the bottom, not the centre';

const near = (a: Bounds, b: Bounds, eps: number): boolean =>
  [0, 1, 2].every(
    (k) => (a.min[k] ?? 0) <= (b.max[k] ?? 0) + eps && (b.min[k] ?? 0) <= (a.max[k] ?? 0) + eps,
  );

const boxGap = (a: Bounds, b: Bounds): number =>
  Math.hypot(
    ...[0, 1, 2].map((k) =>
      Math.max(0, (a.min[k] ?? 0) - (b.max[k] ?? 0), (b.min[k] ?? 0) - (a.max[k] ?? 0)),
    ),
  );

export function touching(a: Mesh, b: Mesh, grid: TriangleGrid, eps = CONTACT_EPS): boolean {
  const bb = meshBounds(b);
  for (const p of surfaceSamples(a, 0.1, 4)) {
    if (!near({ min: p, max: p }, bb, eps)) continue;
    if (grid.nearest(p, eps) <= eps) return true;
  }
  return false;
}

/** Surface distance a → b: exact (sampled) when the boxes are within EXACT_GAP, else the box gap. */
function gapBetween(a: Mesh, b: Mesh): number {
  const box = boxGap(meshBounds(a), meshBounds(b));
  if (box >= EXACT_GAP) return box;
  let best = EXACT_GAP;
  const grid = triangleGrid(b);
  for (const p of surfaceSamples(a, 0.1, 4)) best = Math.min(best, grid.nearest(p, best));
  if (best < EXACT_GAP) return Math.max(box, best);
  // Every sample is past the search radius: the boxes nearly touch but the surfaces don't (a
  // diagonal strut's box against a post). Measure again out to the span of both boxes, which
  // always holds the true nearest surface (the grid walks every cell inside its radius, so it
  // must be finite), rather than report EXACT_GAP.
  const ab = meshBounds(a);
  const bb = meshBounds(b);
  const span = (k: 0 | 1 | 2): number =>
    Math.max(ab.max[k], bb.max[k]) - Math.min(ab.min[k], bb.min[k]);
  best = Math.hypot(span(0), span(1), span(2));
  for (const p of surfaceSamples(a, 0.1, 4)) best = Math.min(best, grid.nearest(p, best));
  return Math.max(box, best);
}

/** The closest thing that holds `m`: a grounded part, or the ground (`nearest` undefined). */
function closest(
  m: Mesh,
  grounded: ReadonlyArray<readonly [string, Mesh]>,
): { gap: number; nearest?: string } {
  let out: { gap: number; nearest?: string } = { gap: meshBounds(m).min[2] };
  const byBox = grounded
    .map(([n, g]) => ({ n, g, box: boxGap(meshBounds(m), meshBounds(g)) }))
    .sort((x, y) => x.box - y.box);
  for (const { n, g, box } of byBox) {
    if (box >= out.gap) break;
    const gap = gapBetween(m, g);
    if (gap < out.gap) out = { gap, nearest: n };
  }
  return out;
}

const cm = (m: number): string => `${(m * 100).toFixed(1)} cm`;

export const floatingParts: Gate = (asset: CompiledAsset): Finding[] => {
  const meshes = [...worldMeshes(asset.parts)];
  const bounds = new Map(meshes.map(([n, m]) => [n, meshBounds(m)]));
  const sunk = new Set(
    meshes.filter(([n]) => (bounds.get(n)?.max[2] ?? 0) < -CONTACT_EPS).map(([n]) => n),
  );
  const grounded = new Set(
    meshes
      .filter(([n]) => !sunk.has(n) && (bounds.get(n)?.min[2] ?? 1) <= CONTACT_EPS)
      .map(([n]) => n),
  );
  const frontier = [...grounded];
  while (frontier.length > 0) {
    const g = frontier.pop() ?? '';
    const gm = meshes.find(([n]) => n === g)?.[1];
    const gb = bounds.get(g);
    if (!gm || !gb) continue;
    for (const [n, m] of meshes) {
      const b = bounds.get(n);
      if (grounded.has(n) || sunk.has(n) || !b || !near(b, gb, CONTACT_EPS)) continue;
      if (touching(m, gm, triangleGrid(gm)) || touching(gm, m, triangleGrid(m))) {
        grounded.add(n);
        frontier.push(n);
      }
    }
  }
  const holders = meshes.filter(([n]) => grounded.has(n));
  return meshes.flatMap(([n, m]): Finding[] => {
    if (sunk.has(n)) {
      const depth = -(bounds.get(n)?.min[2] ?? 0);
      return [
        {
          gate: 'floating-parts',
          code: CODE,
          part: n,
          gap: depth,
          message: `'${n}' is wholly below ground: its base is ${depth.toFixed(2)} m under z = 0`,
          fix: `raise it ${depth.toFixed(2)} m onto the ground or what holds it, or drop it (nobody sees buried geometry); ${ANCHOR}`,
        },
      ];
    }
    if (grounded.has(n)) return [];
    const c = closest(m, holders);
    const onto = c.nearest ? `'${c.nearest}'` : 'the ground';
    return [
      {
        gate: 'floating-parts',
        code: CODE,
        part: n,
        gap: c.gap,
        ...(c.nearest ? { nearest: c.nearest } : {}),
        message: `'${n}' has no surface within ${cm(CONTACT_EPS)} of anything attached to the ground; nearest support ${onto} is ${cm(c.gap)} away`,
        fix: `move it ${cm(c.gap)} onto ${onto} (check \`at\`, parent and the LOD-gated detail around it) — bounding boxes touching is not enough; ${ANCHOR}`,
      },
    ];
  });
};
