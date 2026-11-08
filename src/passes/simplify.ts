// simplify: decimation to a triangle budget by quadric error metrics (Garland & Heckbert 1997)
// with half-edge collapses — a point moves onto a neighbour, so surviving vertices keep their
// exact attributes and nothing is interpolated. Attribute-aware: colour and normal change across
// a collapse add to its cost. Borders and UV seams slide only along themselves under heavy
// constraint planes; the link condition keeps closed manifolds closed; collapses that flip a face
// are refused. For IMPORTED meshes only (scans, base meshes): code-built assets are LOD-gated by
// their recipes, never decimated (ADR 011). Deterministic: total-order heap, index-order passes.

import { type Mesh, Ts23dError } from '../core/index.ts';
import { collapseValid, compact, neighbours } from './simplify-collapse.ts';
import { addInto, addPlane, CollapseHeap, evalSum, QSIZE } from './simplify-quadric.ts';
import {
  BORDER,
  edgeKey,
  LOCKED,
  MANIFOLD,
  SEAM,
  type Topology,
  topology,
} from './simplify-topology.ts';

export interface SimplifyOptions {
  /** Stop at or below this many triangles. */
  readonly targetTris: number;
  /** Open borders keep their outline: border points slide only along the border (default true). */
  readonly preserveBorders?: boolean;
  /** UV / normal / colour seams keep their line (default true). */
  readonly preserveUVSeams?: boolean;
  /** Weight of colour + normal change in the cost (default 1; 0 = geometry only). */
  readonly attributeWeight?: number;
}

export interface Simplified {
  readonly mesh: Mesh;
  /** Largest collapse error accepted, metres: √(quadric cost ÷ the merged area), an RMS distance. */
  readonly error: number;
}

export function simplify(m: Mesh, o: SimplifyOptions): Simplified {
  if (!(Number.isInteger(o.targetTris) && o.targetTris >= 0))
    throw new Ts23dError('T3D_SIMPLIFY_INVALID', {
      cause: `targetTris ${o.targetTris} is not a whole number ≥ 0`,
      fix: 'pass the triangle budget, e.g. simplify(mesh, { targetTris: 2000 })',
    });
  const nf = m.indices.length / 3;
  if (nf <= o.targetTris) return { mesh: m, error: 0 };
  const T = topology(m, o.preserveUVSeams ?? true);
  const q = quadrics(T, o.preserveBorders ?? true);
  const attrW = o.attributeWeight ?? 1;
  const alive = new Uint8Array(nf).fill(1);
  const pointAlive = new Uint8Array(T.points).fill(1);
  const version = new Int32Array(T.points);
  const area = new Float64Array(T.points);
  for (let f = 0; f < nf; f++) {
    const a = faceArea(T, f);
    for (let k = 0; k < 3; k++) {
      const p = T.pt[T.tri[f * 3 + k] ?? 0] ?? 0;
      area[p] = (area[p] ?? 0) + a / 3;
    }
  }
  const edge2 = meanEdge2(T);
  const heap = new CollapseHeap();
  const candidate = (a: number, b: number): void => {
    if (!canSlide(T, a, b)) return;
    const [x, y, z] = [T.pos[b * 3] ?? 0, T.pos[b * 3 + 1] ?? 0, T.pos[b * 3 + 2] ?? 0];
    let cost = evalSum(q, a * QSIZE, b * QSIZE, x, y, z);
    if (attrW > 0) cost += attrW * attrDiff2(m, T, a, b) * (area[a] ?? 0) * edge2;
    heap.push(cost, a, b, version[a] ?? 0, version[b] ?? 0);
  };
  const around = (p: number): void => {
    for (const nb of neighbours(T, alive, p)) {
      candidate(p, nb);
      candidate(nb, p);
    }
  };
  const seed = (): void => {
    for (let p = 0; p < T.points; p++)
      if (pointAlive[p])
        for (const nb of neighbours(T, alive, p))
          if (nb > p) {
            candidate(p, nb);
            candidate(nb, p);
          }
  };
  seed();
  let tris = nf;
  let reseeded = nf;
  let worst = 0;
  const top = [0, 0, 0, 0, 0];
  while (tris > o.targetTris) {
    if (!heap.size) {
      // Collapses refused earlier may be legal now: one more sweep while that still helps.
      if (reseeded === tris) break;
      reseeded = tris;
      seed();
      continue;
    }
    heap.pop(top);
    const [cost, a, b, sa, sb] = top as [number, number, number, number, number];
    if (!pointAlive[a] || !pointAlive[b] || version[a] !== sa || version[b] !== sb) continue;
    const dead = collapseValid(T, alive, a, b);
    if (!dead) continue;
    remap(T, alive, a, b, dead);
    for (const f of dead) alive[f] = 0;
    tris -= dead.length;
    addInto(q, b * QSIZE, a * QSIZE);
    area[b] = (area[b] ?? 0) + (area[a] ?? 0);
    pointAlive[a] = 0;
    version[b] = (version[b] ?? 0) + 1;
    const moved = T.inc[a] ?? [];
    const into = T.inc[b] ?? [];
    for (const f of moved) if (alive[f]) into.push(f);
    T.inc[a] = [];
    worst = Math.max(worst, Math.sqrt(cost / Math.max(area[b] ?? 0, 1e-30)));
    // Only b's quadric changed: re-cost its edges (validity is re-checked at pop time).
    around(b);
  }
  return { mesh: compact(m, T, alive), error: worst };
}

/** Which way a point may move: manifold anywhere; border/seam only along its own special edge. */
function canSlide(T: Topology, a: number, b: number): boolean {
  const k = T.kind[a];
  if (k === MANIFOLD) return true;
  if (k === LOCKED) return false;
  const kb = T.kind[b];
  if (kb !== k && kb !== LOCKED) return false;
  return T.special.has(edgeKey(a, b, T.points)) && (k === BORDER || k === SEAM);
}

/** Wedges of `a` → the wedge of `b` they share a dying face with (else b's first wedge). */
function remap(
  T: Topology,
  alive: Uint8Array,
  a: number,
  b: number,
  dead: readonly number[],
): void {
  const map = new Map<number, number>();
  let fallback = -1;
  for (const f of dead)
    for (let k = 0; k < 3; k++) {
      const w = T.tri[f * 3 + k] ?? 0;
      if (T.pt[w] !== a) continue;
      for (let j = 0; j < 3; j++) {
        const u = T.tri[f * 3 + j] ?? 0;
        if (T.pt[u] === b) {
          if (!map.has(w)) map.set(w, u);
          if (fallback < 0) fallback = u;
        }
      }
    }
  for (const f of T.inc[a] ?? []) {
    if (!alive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const w = T.tri[f * 3 + k] ?? 0;
      if (T.pt[w] === a) T.tri[f * 3 + k] = map.get(w) ?? fallback;
    }
  }
}

function quadrics(T: Topology, borders: boolean): Float64Array {
  const q = new Float64Array(T.points * QSIZE);
  const nf = T.tri.length / 3;
  for (let f = 0; f < nf; f++) {
    const [a, b, c] = [0, 1, 2].map((k) => T.pt[T.tri[f * 3 + k] ?? 0] ?? 0) as [
      number,
      number,
      number,
    ];
    const n = normalOf(T, a, b, c);
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-20) continue;
    const [nx, ny, nz] = [n[0] / len, n[1] / len, n[2] / len];
    const d = -(
      nx * (T.pos[a * 3] ?? 0) +
      ny * (T.pos[a * 3 + 1] ?? 0) +
      nz * (T.pos[a * 3 + 2] ?? 0)
    );
    for (const p of [a, b, c]) addPlane(q, p * QSIZE, nx, ny, nz, d, len / 2);
    // Constraint planes along borders and seams: perpendicular to the face through the edge.
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      if (!T.special.has(edgeKey(u, v, T.points))) continue;
      if (!borders && T.kind[u] === BORDER) continue;
      const ex = (T.pos[v * 3] ?? 0) - (T.pos[u * 3] ?? 0);
      const ey = (T.pos[v * 3 + 1] ?? 0) - (T.pos[u * 3 + 1] ?? 0);
      const ez = (T.pos[v * 3 + 2] ?? 0) - (T.pos[u * 3 + 2] ?? 0);
      let [px, py, pz] = [ey * nz - ez * ny, ez * nx - ex * nz, ex * ny - ey * nx];
      const pl = Math.hypot(px, py, pz);
      if (pl < 1e-20) continue;
      [px, py, pz] = [px / pl, py / pl, pz / pl];
      const pd = -(
        px * (T.pos[u * 3] ?? 0) +
        py * (T.pos[u * 3 + 1] ?? 0) +
        pz * (T.pos[u * 3 + 2] ?? 0)
      );
      const w = 10 * (ex * ex + ey * ey + ez * ez);
      addPlane(q, u * QSIZE, px, py, pz, pd, w);
      addPlane(q, v * QSIZE, px, py, pz, pd, w);
    }
  }
  return q;
}

function normalOf(T: Topology, a: number, b: number, c: number): [number, number, number] {
  const P = T.pos;
  const ux = (P[b * 3] ?? 0) - (P[a * 3] ?? 0);
  const uy = (P[b * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
  const uz = (P[b * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
  const vx = (P[c * 3] ?? 0) - (P[a * 3] ?? 0);
  const vy = (P[c * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
  const vz = (P[c * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function faceArea(T: Topology, f: number): number {
  const [a, b, c] = [0, 1, 2].map((k) => T.pt[T.tri[f * 3 + k] ?? 0] ?? 0) as [
    number,
    number,
    number,
  ];
  const n = normalOf(T, a, b, c);
  return Math.hypot(n[0], n[1], n[2]) / 2;
}

function meanEdge2(T: Topology): number {
  let s = 0;
  const nf = T.tri.length / 3;
  for (let f = 0; f < nf; f++) s += faceArea(T, f);
  return nf ? (s / nf) * 2 : 0;
}

/** Squared colour + normal difference between the first wedges of two points. */
function attrDiff2(m: Mesh, T: Topology, a: number, b: number): number {
  const wa = firstWedge(T, a);
  const wb = firstWedge(T, b);
  if (wa < 0 || wb < 0) return 0;
  let d = 0;
  for (let k = 0; k < 3; k++) {
    const c = (m.colors[wa * 3 + k] ?? 0) - (m.colors[wb * 3 + k] ?? 0);
    const n = (m.normals[wa * 3 + k] ?? 0) - (m.normals[wb * 3 + k] ?? 0);
    d += c * c + 0.25 * n * n;
  }
  return d;
}

function firstWedge(T: Topology, p: number): number {
  for (const f of T.inc[p] ?? [])
    for (let k = 0; k < 3; k++) {
      const w = T.tri[f * 3 + k] ?? 0;
      if (T.pt[w] === p) return w;
    }
  return -1;
}
