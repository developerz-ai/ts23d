// Cleanup for imported meshes (scans, exports, generator output): weld coincident positions into
// topology points (attribute seams kept as separate vertices), drop degenerate and duplicate
// faces, make winding consistent across each shell and outward by signed volume, fill small holes
// with a fan, drop specks below `minShellTris`, and report every shell. Deterministic: first
// occurrence wins, everything iterates in index order.

import type { Mesh } from '../core/index.ts';
import { fillHoles } from './import-holes.ts';
import { pointsOf, shellsOf } from './import-topology.ts';

export interface CleanOptions {
  /** Weld grid as a fraction of the bounding-box diagonal (default 1e-6). */
  readonly weld?: number;
  /** Fill boundary loops of at most this many edges (default 8; 0 = never). */
  readonly maxHoleEdges?: number;
  /** Drop shells with fewer triangles than this (scan debris; default 0 = keep all). */
  readonly minShellTris?: number;
}

export interface ShellReport {
  readonly triangles: number;
  /** Every edge shared by exactly two faces. */
  readonly closed: boolean;
}

export interface CleanReport {
  readonly degenerate: number;
  readonly duplicate: number;
  /** Faces whose winding was flipped to agree with their shell. */
  readonly flipped: number;
  readonly holesFilled: number;
  /** Boundary loops left open (longer than `maxHoleEdges`). */
  readonly holesOpen: number;
  readonly droppedShells: number;
  readonly shells: readonly ShellReport[];
}

export function cleanMesh(m: Mesh, o: CleanOptions = {}): { mesh: Mesh; report: CleanReport } {
  const pt = pointsOf(m, o.weld ?? 1e-6);
  const p = (v: number): number => pt[v] ?? 0;
  const keep: number[] = [];
  const faces = new Set<string>();
  let degenerate = 0;
  let duplicate = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t] ?? 0;
    const b = m.indices[t + 1] ?? 0;
    const c = m.indices[t + 2] ?? 0;
    if (p(a) === p(b) || p(b) === p(c) || p(a) === p(c) || area2(m, a, b, c) < 1e-24) {
      degenerate++;
      continue;
    }
    const key = [p(a), p(b), p(c)].sort((x, y) => x - y).join(',');
    if (faces.has(key)) {
      duplicate++;
      continue;
    }
    faces.add(key);
    keep.push(a, b, c);
  }
  const idx = Uint32Array.from(keep);
  const { shells, turned } = shellsOf(m.positions, idx, pt);
  let flipped = 0;
  // Drop specks, then orient each kept shell outward (negative signed volume → flip it).
  const out: number[] = [];
  const normals = new Float32Array(m.normals);
  const reports: ShellReport[] = [];
  let dropped = 0;
  const seen = new Uint8Array(m.positions.length / 3);
  for (const s of shells) {
    if (s.faces.length < (o.minShellTris ?? 0)) {
      dropped++;
      continue;
    }
    const inv = s.volume < 0;
    for (const f of s.faces) {
      if ((turned[f] === 1) !== inv) flipped++;
      const a = idx[f * 3] ?? 0;
      const b = idx[f * 3 + 1] ?? 0;
      const c = idx[f * 3 + 2] ?? 0;
      out.push(...(inv ? [a, c, b] : [a, b, c]));
    }
    // An inside-out shell's stored normals point inward with its winding: turn both.
    if (inv)
      for (const f of s.faces)
        for (let k = 0; k < 3; k++) {
          const v = idx[f * 3 + k] ?? 0;
          if (seen[v]) continue;
          seen[v] = 1;
          for (let j = 0; j < 3; j++) normals[v * 3 + j] = -(normals[v * 3 + j] ?? 0);
        }
    reports.push({ triangles: s.faces.length, closed: s.closed });
  }
  const oriented = Uint32Array.from(out);
  const holes = fillHoles(oriented, pt, o.maxHoleEdges ?? 8);
  const mesh: Mesh = { ...m, normals, indices: holes.indices };
  return {
    mesh,
    report: {
      degenerate,
      duplicate,
      flipped,
      holesFilled: holes.filled,
      holesOpen: holes.open,
      droppedShells: dropped,
      shells: reports,
    },
  };
}

function area2(m: Mesh, a: number, b: number, c: number): number {
  const P = m.positions;
  const ux = (P[b * 3] ?? 0) - (P[a * 3] ?? 0);
  const uy = (P[b * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
  const uz = (P[b * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
  const vx = (P[c * 3] ?? 0) - (P[a * 3] ?? 0);
  const vy = (P[c * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
  const vz = (P[c * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
  const x = uy * vz - uz * vy;
  const y = uz * vx - ux * vz;
  const z = ux * vy - uy * vx;
  return x * x + y * y + z * z;
}

/** Area-weighted smooth normals over welded points (for files that carry none). */
export function smoothNormals(m: Mesh, weld = 1e-6): Mesh {
  const pt = pointsOf(m, weld);
  const acc = new Float64Array(m.positions.length);
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const ux = (P[b * 3] ?? 0) - (P[a * 3] ?? 0);
    const uy = (P[b * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
    const uz = (P[b * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
    const vx = (P[c * 3] ?? 0) - (P[a * 3] ?? 0);
    const vy = (P[c * 3 + 1] ?? 0) - (P[a * 3 + 1] ?? 0);
    const vz = (P[c * 3 + 2] ?? 0) - (P[a * 3 + 2] ?? 0);
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const v of [a, b, c]) {
      const q = (pt[v] ?? 0) * 3;
      for (let k = 0; k < 3; k++) acc[q + k] = (acc[q + k] ?? 0) + (n[k] ?? 0);
    }
  }
  const normals = new Float32Array(m.normals.length);
  for (let v = 0; v < normals.length / 3; v++) {
    const q = (pt[v] ?? 0) * 3;
    const l = Math.hypot(acc[q] ?? 0, acc[q + 1] ?? 0, acc[q + 2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) normals[v * 3 + k] = (acc[q + k] ?? 0) / l;
  }
  return { ...m, normals };
}
