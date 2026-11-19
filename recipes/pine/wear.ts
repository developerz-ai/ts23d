// The pine's age story. A Scots pine self-prunes: the lower whorls die in the shade and snap off,
// leaving short grey dead stubs up the clear bole; one whole dead branch, bare and silvered, hangs
// on in the lower crown; cones (3–7.5 cm) hang in twos and threes under the outer shoots.

import { type Mesh, MeshBuilder, merge, stripRect, sweep, type Vec3 } from '@developerz.ai/ts23d';
import { brokenLimb, trunkAt } from '../_lib/trees/wear.ts';

/** Cone brown under vertex colour on the plain strip. */
const CONE: Vec3 = [0.36, 0.25, 0.15];

/**
 * Dead stubs in whorls up the bole from `z0` to `z1`: 3 per whorl, 0.3–0.6 m long, their roots
 * buried in `trunk` (the same LOD's trunk mesh). `pick` is the recipe's seeded 0..1 source.
 */
export function boleStubs(
  trunk: Mesh,
  z0: number,
  z1: number,
  whorls: number,
  lod: number,
  pick: () => number,
): Mesh {
  const out: Mesh[] = [];
  for (let w = 0; w < whorls; w++) {
    const z = z0 + ((z1 - z0) * (w + 0.5)) / whorls;
    const { c, r } = trunkAt(trunk, z);
    const turn = pick() * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      if (pick() < 0.25) continue;
      const a = turn + (k / 3) * Math.PI * 2;
      const lift = 0.15 + pick() * 0.2;
      const d = Math.hypot(1, lift);
      const dir: Vec3 = [Math.cos(a) / d, Math.sin(a) / d, lift / d];
      out.push(brokenLimb(c, dir, r + 0.3 + pick() * 0.3, 0.045, lod === 0 ? 5 : 3));
    }
  }
  return merge(out);
}

/** A bare dead branch from the bole at `from` (on its axis) out along `yaw`, drooping a little. */
export function deadBranch(from: Vec3, r: number, yawDeg: number, lod: number): Mesh {
  const a = (yawDeg * Math.PI) / 180;
  const dir: Vec3 = [Math.cos(a) * 0.97, Math.sin(a) * 0.97, -0.24];
  return brokenLimb(from, dir, r + 2.6, 0.07, lod === 0 ? 6 : 4);
}

/** One closed cone: a tapered sweep hanging from `at` (its stalk end) down along `dir`. */
function cone(at: Vec3, dir: Vec3, len: number): Mesh {
  const path: Vec3[] = [0, 0.3, 0.65, 1].map((t) => [
    at[0] + dir[0] * len * t,
    at[1] + dir[1] * len * t,
    at[2] + dir[2] * len * t,
  ]);
  return sweep({
    section: { radius: 1, segments: 5 },
    path,
    scale: [0.12, 0.38, 0.32, 0.08].map((k) => k * len),
    color: CONE,
    caps: true,
  });
}

/**
 * Cones under the outer shoots: for every `every`-th needle tuft root (56 vertices a tuft, root
 * first) farther than `outer` × the crown radius from the axis, a cluster of two or three.
 */
export function cones(tufts: Mesh, every: number, outer: number, len: number): Mesh {
  const per = 56;
  const n = Math.floor(tufts.positions.length / 3 / per);
  let rMax = 0;
  for (let t = 0; t < n; t++) {
    const i = t * per * 3;
    rMax = Math.max(rMax, Math.hypot(tufts.positions[i] ?? 0, tufts.positions[i + 1] ?? 0));
  }
  const out: Mesh[] = [];
  for (let t = 0; t < n; t += every) {
    const i = t * per * 3;
    const p: Vec3 = [
      tufts.positions[i] ?? 0,
      tufts.positions[i + 1] ?? 0,
      tufts.positions[i + 2] ?? 0,
    ];
    if (Math.hypot(p[0], p[1]) < outer * rMax) continue;
    const count = 2 + (t % 2);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + t;
      const dir: Vec3 = [Math.cos(a) * 0.35, Math.sin(a) * 0.35, -0.94];
      out.push(cone(p, dir, len * (0.85 + 0.15 * k)));
    }
  }
  return merge(out);
}

/** Fresh resin under vertex colour: pale amber, bright against the grey-brown plates. */
const RESIN: Vec3 = [1, 0.8, 0.42];
/** The weeping, darkened rim of the wound. */
const RIM: Vec3 = [0.18, 0.12, 0.08];

/**
 * Trunk axis point and radius at `z`, interpolated between the sweep's rings (they are ~2 m
 * apart, so a window around `z` can miss every vertex). Rings = vertices grouped by height.
 */
function ringAt(trunk: Mesh, z: number): { c: Vec3; r: number } {
  const rings = new Map<number, { x: number; y: number; n: number; pts: [number, number][] }>();
  for (let i = 0; i < trunk.positions.length / 3; i++) {
    if (Math.abs(trunk.normals[i * 3 + 2] ?? 0) > 0.5) continue; // cap vertices
    const key = Math.round((trunk.positions[i * 3 + 2] ?? 0) * 20);
    const x = trunk.positions[i * 3] ?? 0;
    const y = trunk.positions[i * 3 + 1] ?? 0;
    const g = rings.get(key) ?? { x: 0, y: 0, n: 0, pts: [] };
    g.x += x;
    g.y += y;
    g.n++;
    g.pts.push([x, y]);
    rings.set(key, g);
  }
  const list = [...rings.entries()]
    .filter(([, g]) => g.n >= 4)
    .map(([k, g]) => {
      const cx = g.x / g.n;
      const cy = g.y / g.n;
      const r = Math.max(...g.pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      return { z: k / 20, c: [cx, cy] as const, r };
    })
    .sort((a, b) => a.z - b.z);
  let lo = list[0];
  let hi = list[list.length - 1];
  for (const q of list) {
    if (q.z <= z) lo = q;
    if (q.z >= z && hi && q.z < hi.z) hi = q;
  }
  if (!lo || !hi) return { c: [0, 0, z], r: 0 };
  const t = hi.z > lo.z ? (z - lo.z) / (hi.z - lo.z) : 0;
  return {
    c: [lo.c[0] + (hi.c[0] - lo.c[0]) * t, lo.c[1] + (hi.c[1] - lo.c[1]) * t, z],
    r: lo.r + (hi.r - lo.r) * t,
  };
}

/**
 * An old wound on the bole (a lightning strip or a deer-frayed scar): a curved patch 2 cm
 * proud of the bark facing `azDeg`, from `z0` to `z1`, ±`half` radians about the axis, amber
 * resin with a dark weeping rim, narrowing to a point below (the resin run). The trunk rings are
 * 2 m apart, so per-vertex colour on the trunk itself cannot hold a wound this size. On the
 * `wood_weathered` strip; merge it into the trunk (one static body).
 */
export function resinScar(
  trunk: Mesh,
  azDeg: number,
  z0: number,
  z1: number,
  half: number,
  lod: number,
): Mesh {
  const band = stripRect('wood_weathered');
  const v = (band.v0 + band.v1) / 2;
  const mb = new MeshBuilder();
  const A = lod === 0 ? 6 : 3;
  const Z = lod === 0 ? 10 : 5;
  const az = (azDeg * Math.PI) / 180;
  const ids: number[][] = [];
  for (let j = 0; j <= Z; j++) {
    const t = j / Z;
    const z = z0 + (z1 - z0) * t;
    const { c, r } = ringAt(trunk, z);
    // Lens outline: a point at the foot (the resin run), widest ~60% up, closing at the top.
    const w = half * Math.sin(Math.PI * t ** 0.75);
    const row: number[] = [];
    for (let i = 0; i <= A; i++) {
      const s = i / A - 0.5;
      const a = az + 2 * s * Math.max(0.02, w);
      const n: Vec3 = [Math.cos(a), Math.sin(a), 0];
      const edge = Math.abs(s) * 2;
      const k = edge > 0.6 ? (edge - 0.6) / 0.4 : 0;
      const color: Vec3 = [
        RESIN[0] + (RIM[0] - RESIN[0]) * k,
        RESIN[1] + (RIM[1] - RESIN[1]) * k,
        RESIN[2] + (RIM[2] - RESIN[2]) * k,
      ];
      const p: Vec3 = [c[0] + n[0] * (r + 0.02), c[1] + n[1] * (r + 0.02), z];
      row.push(mb.vertex({ p, n, uv: [band.u0 + (i / A) * 0.01, v], color }));
    }
    ids.push(row);
  }
  for (let j = 0; j < Z; j++)
    for (let i = 0; i < A; i++) {
      const a = ids[j]?.[i] ?? 0;
      const b = ids[j]?.[i + 1] ?? 0;
      const c = ids[j + 1]?.[i + 1] ?? 0;
      const d = ids[j + 1]?.[i] ?? 0;
      mb.tri(a, b, c);
      mb.tri(a, c, d);
    }
  return mb.build();
}
