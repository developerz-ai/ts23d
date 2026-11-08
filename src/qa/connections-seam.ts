// Seams INSIDE one sculpted mesh (organic kinds): forms pushed together without a blend leave a
// concave crease line — brow into nose, cheek into muzzle, "blobs glued together". Each interior
// edge whose two faces fold into a valley sharper than SEAM_DEG is a crease edge; crease edges
// chain through shared vertices; a chain longer than a few percent of the mesh is a seam →
//   T3D_CONNECT_SEAM (location, length, sharpness, the blend radius that would soften it)
// unless a declared `creases` region (eyelid, nasolabial fold, mouth line) covers it. Hard edges
// with split normals (bevels, plinths, armour rims) are authored on purpose and never count.
// The fold scale grows with the shell only up to SEAM_CAP: on a 10 m dragon 1.5 % is 15 cm, and
// every muscle groove would count. Past the cap a fold counts when it is tighter than SEAM_CAP, or
// when one edge alone turns SEAM_SHARP_DEG (a junction line the mesh cannot resolve as a curve).

import type { IntendedCrease, Vec3 } from '../core/index.ts';
import { type ConnectIssue, cm, fmt } from './connections-declare.ts';
import { type Shell, weld } from './connections-shells.ts';
import { boxGap, probeOf } from './contact.ts';
import { glob } from './inspect.ts';

/** Smallest fold (degrees between face normals) considered — below it is tessellation. */
export const SEAM_DEG = 12;
/** A fold is a seam when its radius of curvature is under this share of the shell's size. */
export const SEAM_RADIUS = 0.015;
/** Absolute cap on that radius (metres): a big shell's folds are judged like a 1.7 m one's. */
export const SEAM_CAP = 0.025;
/** Past the cap, a single edge folding this much is a hard junction line, whatever its spacing. */
export const SEAM_SHARP_DEG = 40;
/** Shells this dense are sculpts (block-outs and props stay below). */
export const SCULPT_TRIS = 1500;

export interface Seam {
  readonly part: string;
  readonly at: Vec3;
  readonly length: number;
  /** Mean fold angle, degrees. */
  readonly sharpness: number;
  /** Mean edge length (the mesh's resolution here). */
  readonly edge: number;
  /** Bounding radius of the chain (for the overlay). */
  readonly radius: number;
  /** Midpoints of the crease edges, for drawing the line. */
  readonly trace: readonly Vec3[];
}

/** Crease edges of `s` chained into lines ≥ `minLength`: concave folds of ≥ `minDeg` whose
 *  radius of curvature (face-centre spacing ÷ fold angle) is under `maxRadius`, and — when
 *  `maxRadius` exceeds `cap` — under `cap` or folding ≥ SEAM_SHARP_DEG on that one edge. */
export function seamsOf(
  s: Shell,
  minLength: number,
  maxRadius: number,
  minDeg = SEAM_DEG,
  hidden: (p: Vec3) => boolean = () => false,
  cap = Number.POSITIVE_INFINITY,
): Seam[] {
  const sharp = (SEAM_SHARP_DEG * Math.PI) / 180;
  const m = s.mesh;
  const P = m.positions;
  const nt = P.length / 9;
  const ids = weld(m);
  const nv = ids.length;
  const normal = new Float64Array(nt * 3);
  const centre = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const u = [0, 1, 2].map((k) => (P[o + 3 + k] ?? 0) - (P[o + k] ?? 0));
    const v = [0, 1, 2].map((k) => (P[o + 6 + k] ?? 0) - (P[o + k] ?? 0));
    const x = [
      (u[1] ?? 0) * (v[2] ?? 0) - (u[2] ?? 0) * (v[1] ?? 0),
      (u[2] ?? 0) * (v[0] ?? 0) - (u[0] ?? 0) * (v[2] ?? 0),
      (u[0] ?? 0) * (v[1] ?? 0) - (u[1] ?? 0) * (v[0] ?? 0),
    ];
    const l = Math.hypot(x[0] ?? 0, x[1] ?? 0, x[2] ?? 0) || 1;
    for (let k = 0; k < 3; k++) {
      normal[t * 3 + k] = (x[k] ?? 0) / l;
      centre[t * 3 + k] = ((P[o + k] ?? 0) + (P[o + 3 + k] ?? 0) + (P[o + 6 + k] ?? 0)) / 3;
    }
  }
  const first = new Map<number, number>();
  // A hard edge the author meant has split normals (each face its own); a smooth-shaded fold
  // (shared normals) is a sculpt that creased by accident.
  const N = m.normals;
  const split = (t: number, o: number, weldId: number): boolean => {
    let i = t * 3;
    while (i < t * 3 + 2 && ids[i] !== weldId) i++;
    let j = o * 3;
    while (j < o * 3 + 2 && ids[j] !== weldId) j++;
    const d =
      (N[i * 3] ?? 0) * (N[j * 3] ?? 0) +
      (N[i * 3 + 1] ?? 0) * (N[j * 3 + 1] ?? 0) +
      (N[i * 3 + 2] ?? 0) * (N[j * 3 + 2] ?? 0);
    return d < 0.95;
  };
  const cos = Math.cos((minDeg * Math.PI) / 180);
  // Crease edges: [vertex a, vertex b, length, angle, midpoint xyz].
  const crease: number[][] = [];
  for (let t = 0; t < nt; t++)
    for (let e = 0; e < 3; e++) {
      const ia = t * 3 + e;
      const ib = t * 3 + ((e + 1) % 3);
      const a = ids[ia] ?? 0;
      const b = ids[ib] ?? 0;
      if (a === b) continue;
      const key = Math.min(a, b) * nv + Math.max(a, b);
      const o = first.get(key);
      if (o === undefined) {
        first.set(key, t);
        continue;
      }
      if (o < 0) continue;
      first.set(key, -1);
      let c = 0;
      let rise = 0;
      for (let k = 0; k < 3; k++) {
        c += (normal[t * 3 + k] ?? 0) * (normal[o * 3 + k] ?? 0);
        rise += ((centre[t * 3 + k] ?? 0) - (centre[o * 3 + k] ?? 0)) * (normal[o * 3 + k] ?? 0);
      }
      if (c > cos || rise <= 0 || split(t, o, a)) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, c)));
      const gap = Math.hypot(
        (centre[t * 3] ?? 0) - (centre[o * 3] ?? 0),
        (centre[t * 3 + 1] ?? 0) - (centre[o * 3 + 1] ?? 0),
        (centre[t * 3 + 2] ?? 0) - (centre[o * 3 + 2] ?? 0),
      );
      if (gap / angle > maxRadius || (gap / angle > cap && angle < sharp)) continue;
      const pa = [0, 1, 2].map((k) => P[ia * 3 + k] ?? 0);
      const pb = [0, 1, 2].map((k) => P[ib * 3 + k] ?? 0);
      crease.push([
        a,
        b,
        Math.hypot(
          (pa[0] ?? 0) - (pb[0] ?? 0),
          (pa[1] ?? 0) - (pb[1] ?? 0),
          (pa[2] ?? 0) - (pb[2] ?? 0),
        ),
        (angle * 180) / Math.PI,
        ((pa[0] ?? 0) + (pb[0] ?? 0)) / 2,
        ((pa[1] ?? 0) + (pb[1] ?? 0)) / 2,
        ((pa[2] ?? 0) + (pb[2] ?? 0)) / 2,
      ]);
    }
  // Open borders (a sculpt cut at the neck) fold jaggedly: ignore creases one ring from them.
  const paired = new Set<number>();
  for (const [key, t] of first) if (t < 0) paired.add(key);
  const rim = new Set<number>();
  for (const key of first.keys())
    if (!paired.has(key)) {
      rim.add(Math.floor(key / nv));
      rim.add(key % nv);
    }
  const near = new Set<number>(rim);
  for (let t = 0; t < nt; t++)
    if (rim.has(ids[t * 3] ?? -1) || rim.has(ids[t * 3 + 1] ?? -1) || rim.has(ids[t * 3 + 2] ?? -1))
      for (let v = 0; v < 3; v++) near.add(ids[t * 3 + v] ?? -1);
  const kept = crease.filter(
    ([a, b, , , x, y, z]) =>
      !near.has(a ?? -1) && !near.has(b ?? -1) && !hidden([x ?? 0, y ?? 0, z ?? 0]),
  );
  // Chain crease edges sharing a vertex.
  const up = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while ((up.get(r) ?? r) !== r) r = up.get(r) ?? r;
    up.set(x, r);
    return r;
  };
  for (const [a, b] of kept) {
    const ra = find(a ?? 0);
    const rb = find(b ?? 0);
    if (ra !== rb) up.set(Math.max(ra, rb), Math.min(ra, rb));
  }
  const chains = new Map<number, number[][]>();
  for (const c of kept) {
    const r = find(c[0] ?? 0);
    chains.set(r, [...(chains.get(r) ?? []), c]);
  }
  const out: Seam[] = [];
  for (const edges of chains.values()) {
    const length = edges.reduce((m, e) => m + (e[2] ?? 0), 0);
    if (length < minLength) continue;
    const at: [number, number, number] = [0, 0, 0];
    let angle = 0;
    for (const e of edges) {
      const w = (e[2] ?? 0) / length;
      angle += (e[3] ?? 0) * w;
      for (const k of [0, 1, 2] as const) at[k] += (e[4 + k] ?? 0) * w;
    }
    const radius = edges.reduce(
      (m, e) =>
        Math.max(m, Math.hypot((e[4] ?? 0) - at[0], (e[5] ?? 0) - at[1], (e[6] ?? 0) - at[2])),
      0,
    );
    const trace: Vec3[] = edges.map((e) => [e[4] ?? 0, e[5] ?? 0, e[6] ?? 0]);
    out.push({
      part: s.part,
      at,
      length,
      sharpness: angle,
      edge: length / edges.length,
      radius,
      trace,
    });
  }
  return out.sort((a, b) => b.length * b.sharpness - a.length * a.sharpness);
}

const inRegion = (p: Vec3, c: IntendedCrease): boolean =>
  Math.hypot(p[0] - c.at[0], p[1] - c.at[1], p[2] - c.at[2]) <= c.radius;

/** A seam is declared when a crease region holds its centre, or when declared regions strung along
 *  the fold hold ≥ 80 % of its trace (curved folds and rings, whose centre lies off the surface). */
const TRACE_COVERED = 0.8;

const covered = (seam: Seam, creases: readonly IntendedCrease[]): boolean => {
  const mine = creases.filter((c) => glob(c.part).test(seam.part));
  if (mine.some((c) => inRegion(seam.at, c))) return true;
  if (seam.trace.length === 0 || mine.length === 0) return false;
  const held = seam.trace.filter((p) => mine.some((c) => inRegion(p, c))).length;
  return held >= TRACE_COVERED * seam.trace.length;
};

/** Seam issues for one sculpted shell; at most `limit`, longest and sharpest first. Folds
 *  hidden inside other solid pieces (a neck sunk into the bust) are not seen, so not counted. */
export function seamIssues(
  s: Shell,
  creases: readonly IntendedCrease[],
  others: readonly Shell[],
  limit = 6,
): ConnectIssue[] {
  if (s.mesh.positions.length / 9 < SCULPT_TRIS) return [];
  const b = s.bounds;
  const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const covers = others.filter((o) => o !== s && o.solid && boxGap(o, s) <= 0);
  const hidden = (p: Vec3): boolean => covers.some((o) => probeOf(o).inside(p));
  return seamsOf(
    s,
    Math.max(0.01, 0.04 * diag),
    Math.max(0.004, SEAM_RADIUS * diag),
    SEAM_DEG,
    hidden,
    SEAM_CAP,
  )
    .filter((x) => !covered(x, creases))
    .slice(0, limit)
    .map((x) => ({
      code: 'T3D_CONNECT_SEAM',
      severity: 'error',
      part: x.part,
      at: x.at,
      radius: x.radius + 0.005,
      trace: x.trace,
      message: `'${x.part}' has a ${cm(x.length)} crease at ${fmt(x.at)} folding ${x.sharpness.toFixed(0)}° — two forms pushed together without a blend`,
      fix: `raise the blend radius between the sculpt edits that meet at ${fmt(x.at)} to ≥ ${cm(Math.max(0.006, x.edge * 4))}, or declare it: creases: [{ name, part: '${x.part}', at: ${fmt(x.at)}, radius: ${(x.radius + 0.01).toFixed(2)}, why }]`,
    }));
}
