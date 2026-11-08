// Edge topology of a triangle mesh, welded by position: how many triangles use each undirected
// edge and in which directions. Closed = no edge used once (no boundary); manifold = no edge used
// by more than two triangles and every shared edge walked once each way (consistent winding).

import type { Mesh, Vec3 } from '../core/index.ts';
import { vertex, weldIds } from './mesh-input.ts';

export interface Topology {
  /** Edges used by exactly one triangle (or an odd count): holes in the surface. */
  readonly boundary: number;
  /** Edges shared by more than two triangles: fins, T-junction stacks, double walls. */
  readonly nonManifold: number;
  /** Two-triangle edges walked the same way by both: a flipped neighbour. */
  readonly misoriented: number;
  /** Where the first offending edge of each kind sits (world midpoint), for the message. */
  readonly where: { boundary?: Vec3; nonManifold?: Vec3; misoriented?: Vec3 };
  /** Signed enclosed volume, m³ (positive = outward winding, when closed). */
  readonly volume: number;
}

export function topology(m: Mesh): Topology {
  const ids = weldIds(m);
  // Undirected edge → [uses a<b direction, uses b<a direction, a vertex index, b vertex index].
  const edges = new Map<string, [number, number, number, number]>();
  let volume = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a, b, c] = v.map((i) => vertex(m, i)) as [Vec3, Vec3, Vec3];
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
    for (let j = 0; j < 3; j++) {
      const i0 = v[j] ?? 0;
      const i1 = v[(j + 1) % 3] ?? 0;
      const p = ids[i0] ?? 0;
      const q = ids[i1] ?? 0;
      if (p === q) continue;
      const k = p < q ? `${p},${q}` : `${q},${p}`;
      const e = edges.get(k) ?? [0, 0, i0, i1];
      if (p < q) e[0]++;
      else e[1]++;
      edges.set(k, e);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  let misoriented = 0;
  const where: { boundary?: Vec3; nonManifold?: Vec3; misoriented?: Vec3 } = {};
  const mid = (e: readonly number[]): Vec3 => {
    const a = vertex(m, e[2] ?? 0);
    const b = vertex(m, e[3] ?? 0);
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  };
  for (const e of edges.values()) {
    const uses = e[0] + e[1];
    if (uses % 2 === 1) {
      boundary++;
      where.boundary ??= mid(e);
    }
    if (uses > 2) {
      nonManifold++;
      where.nonManifold ??= mid(e);
    } else if (uses === 2 && e[0] !== e[1]) {
      misoriented++;
      where.misoriented ??= mid(e);
    }
  }
  return { boundary, nonManifold, misoriented, where, volume };
}

export const fmtPoint = (p: Vec3 | undefined): string =>
  p ? `(${p.map((x) => x.toFixed(3)).join(', ')})` : '';
