// Gate: everything is attached. A part is grounded if some surface of it lies within CONTACT_EPS of
// z = 0 (or it straddles z = 0) or its SURFACE comes within CONTACT_EPS of a grounded part's
// surface, transitively, or its edges cross into a closed grounded part (floating-contact.ts: a
// post sunk into its base, a rail through its posts). Bounding boxes are only the prefilter. A part wholly below the ground is
// its own finding: sunk geometry is invisible and was counted as grounded before (D36). A water
// asset (`medium: 'water'`) has no ground: its largest connected body, by surface area, holds the
// rest, and nothing is ever "sunk". Text and order of the findings: floating-findings.ts.

import { type Bounds, type CompiledAsset, type Mesh, worldMeshes } from '../core/index.ts';
import { edgeGap, edgesTouch } from './floating-contact.ts';
import { floatingFindings } from './floating-findings.ts';
import { surfaceSamples, type TriangleGrid } from './geometry.ts';
import { meshBounds, triangleGrid } from './geometry-cache.ts';
import { CONTACT_EPS, type Finding, type Gate } from './types.ts';

/** Below this box distance the reported gap is the exact surface distance; beyond, the box's. */
const EXACT_GAP = 0.3;

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

/** A sparse sample of `a` (vertices, a few points an edge, centroids) within `eps` of `b`. */
function sampleTouch(a: Mesh, b: Mesh, grid: TriangleGrid, eps: number): boolean {
  const bb = meshBounds(b);
  for (const p of surfaceSamples(a, 0.1, 4)) {
    if (!near({ min: p, max: p }, bb, eps)) continue;
    if (grid.nearest(p, eps) <= eps) return true;
  }
  return false;
}

/** `a` reaches `b`: a sample or an edge of `a` within `eps` of `b`'s surface, or an edge of `a`
 *  crossing into a closed `b` (`grid` is `b`'s). */
export function touching(a: Mesh, b: Mesh, grid: TriangleGrid, eps = CONTACT_EPS): boolean {
  return sampleTouch(a, b, grid, eps) || edgesTouch(a, b, eps);
}

/** Either reaches the other; the cheap sparse samples both ways before the edge walks. */
function meet(a: Mesh, b: Mesh): boolean {
  const [ga, gb] = [triangleGrid(a), triangleGrid(b)];
  return (
    sampleTouch(a, b, gb, CONTACT_EPS) ||
    sampleTouch(b, a, ga, CONTACT_EPS) ||
    edgesTouch(a, b, CONTACT_EPS) ||
    edgesTouch(b, a, CONTACT_EPS)
  );
}

/** Surface distance a → b: exact (sampled) when the boxes are within EXACT_GAP, else the box gap. */
function gapBetween(a: Mesh, b: Mesh): number {
  const box = boxGap(meshBounds(a), meshBounds(b));
  if (box >= EXACT_GAP) return box;
  let best = EXACT_GAP;
  const grid = triangleGrid(b);
  for (const p of surfaceSamples(a, 0.1, 4)) best = Math.min(best, grid.nearest(p, best));
  // The sparse samples overstate it (a rail's four points an edge miss the post it passes).
  best = Math.min(best, edgeGap(a, b, best));
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

/** The closest thing that holds `m`: a held part, or the ground (`nearest` undefined). */
function closest(
  m: Mesh,
  grounded: ReadonlyArray<readonly [string, Mesh]>,
  ground: boolean,
): { gap: number; nearest?: string } {
  let out: { gap: number; nearest?: string } = {
    gap: ground ? meshBounds(m).min[2] : Number.POSITIVE_INFINITY,
  };
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

type Named = readonly [string, Mesh];

/** Grows `held` by every part touching it, transitively (`sunk` parts hold nothing). */
function spread(
  meshes: readonly Named[],
  bounds: ReadonlyMap<string, Bounds>,
  held: Set<string>,
  sunk: ReadonlySet<string>,
): void {
  const frontier = [...held];
  while (frontier.length > 0) {
    const g = frontier.pop() ?? '';
    const gm = meshes.find(([n]) => n === g)?.[1];
    const gb = bounds.get(g);
    if (!gm || !gb) continue;
    for (const [n, m] of meshes) {
      const b = bounds.get(n);
      if (held.has(n) || sunk.has(n) || !b || !near(b, gb, CONTACT_EPS)) continue;
      if (meet(m, gm)) {
        held.add(n);
        frontier.push(n);
      }
    }
  }
}

function surfaceArea(m: Mesh): number {
  const P = m.positions;
  const T = m.indices;
  let sum = 0;
  for (let t = 0; t < T.length; t += 3) {
    const [a, b, c] = [(T[t] ?? 0) * 3, (T[t + 1] ?? 0) * 3, (T[t + 2] ?? 0) * 3];
    const u = [0, 1, 2].map((k) => (P[b + k] ?? 0) - (P[a + k] ?? 0));
    const v = [0, 1, 2].map((k) => (P[c + k] ?? 0) - (P[a + k] ?? 0));
    const [ux = 0, uy = 0, uz = 0] = u;
    const [vx = 0, vy = 0, vz = 0] = v;
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
}

/** The connected group of parts with the most surface: what a swimmer's other parts must reach. */
function largestBody(meshes: readonly Named[], bounds: ReadonlyMap<string, Bounds>): Set<string> {
  const seen = new Set<string>();
  let best = new Set<string>();
  let bestArea = -1;
  for (const [n] of meshes) {
    if (seen.has(n)) continue;
    const group = new Set([n]);
    spread(meshes, bounds, group, new Set());
    let area = 0;
    for (const [g, m] of meshes) {
      if (!group.has(g)) continue;
      seen.add(g);
      area += surfaceArea(m);
    }
    if (area > bestArea) [best, bestArea] = [group, area];
  }
  return best;
}

export const floatingParts: Gate = (asset: CompiledAsset): Finding[] => {
  const meshes = [...worldMeshes(asset.parts)];
  const bounds = new Map(meshes.map(([n, m]) => [n, meshBounds(m)]));
  const water = asset.medium === 'water';
  const sunk = new Set(
    water
      ? []
      : meshes.filter(([n]) => (bounds.get(n)?.max[2] ?? 0) < -CONTACT_EPS).map(([n]) => n),
  );
  const grounded = water
    ? largestBody(meshes, bounds)
    : new Set(
        meshes
          .filter(([n]) => !sunk.has(n) && (bounds.get(n)?.min[2] ?? 1) <= CONTACT_EPS)
          .map(([n]) => n),
      );
  if (!water) spread(meshes, bounds, grounded, sunk);
  const holders = meshes.filter(([n]) => grounded.has(n));
  const byName = new Map(meshes);
  const touch = (a: string, b: string): boolean => {
    const [ma, mb, ba, bb] = [byName.get(a), byName.get(b), bounds.get(a), bounds.get(b)];
    return !!ma && !!mb && !!ba && !!bb && near(ba, bb, CONTACT_EPS) && meet(ma, mb);
  };
  return floatingFindings({
    floating: meshes.filter(([n]) => !sunk.has(n) && !grounded.has(n)).map(([n]) => n),
    sunk: meshes.filter(([n]) => sunk.has(n)).map(([n]) => [n, -(bounds.get(n)?.min[2] ?? 0)]),
    water,
    touch,
    closest: (n) => {
      const m = byName.get(n);
      return m ? closest(m, holders, !water) : { gap: 0 };
    },
  });
};
