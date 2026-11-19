// The pine's age story. A Scots pine self-prunes: the lower whorls die in the shade and snap off,
// leaving short grey dead stubs up the clear bole; one whole dead branch, bare and silvered, hangs
// on in the lower crown; cones (3–7.5 cm) hang in twos and threes under the outer shoots.

import { type Mesh, merge, sweep, type Vec3 } from '@developerz.ai/ts23d';
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
