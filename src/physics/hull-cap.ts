// Vertex-capped convex hulls for colliders: the support points of the mesh along a Fibonacci
// sphere of directions (a k-DOP) are hulled; fewer directions until the hull fits the cap.
// Every hull vertex is a real mesh vertex, so the hull never pokes outside the true hull.

import type { Vec3 } from '../core/index.ts';
import { convexHull, type Hull } from './hull.ts';

/** `n` unit directions spread evenly over the sphere (golden-angle spiral), deterministic. */
export function sphereDirections(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    out.push([Math.cos(golden * i) * r, Math.sin(golden * i) * r, z]);
  }
  // The six axis directions first: boxes keep their exact corners.
  return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], ...out];
}

/** Flat xyz array → points, de-duplicated on a 0.1 mm grid (first occurrence wins). */
export function pointsOf(positions: Float32Array): Vec3[] {
  const seen = new Set<string>();
  const out: Vec3[] = [];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p: Vec3 = [positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0];
    const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** The point with the largest projection on each direction (lowest index on ties), unique. */
export function supportPoints(points: readonly Vec3[], dirs: readonly Vec3[]): Vec3[] {
  const picked = new Set<number>();
  for (const d of dirs) {
    let best = -1;
    let bestDot = -Infinity;
    points.forEach((p, i) => {
      const v = p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
      if (v > bestDot + 1e-9) [bestDot, best] = [v, i];
    });
    if (best >= 0) picked.add(best);
  }
  return [...picked].sort((a, b) => a - b).map((i) => points[i] ?? [0, 0, 0]);
}

/** A convex hull with at most `maxVertices` vertices (≥ 8), or null for flat input. */
export function cappedHull(points: readonly Vec3[], maxVertices = 64): Hull | null {
  const cap = Math.max(8, maxVertices);
  // One pass over the full mesh; coarser direction sets then search only these candidates.
  const candidates = supportPoints(points, sphereDirections(256));
  for (let n = 256; n >= 8; n = Math.floor(n * 0.75)) {
    const h = convexHull(supportPoints(candidates, sphereDirections(n)));
    if (!h) return null;
    if (h.vertices.length <= cap) return h;
  }
  return convexHull(supportPoints(candidates, sphereDirections(2)));
}
