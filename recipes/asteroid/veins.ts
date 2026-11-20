// Ore veins as a fracture network: the faces of a 3D Voronoi cell pattern (~2.4 m cells) are the
// rock's fracture planes, and ore fills some of them. Where the surface crosses a filled face it
// draws a vein; where three cells meet the veins branch. A face is filled or barren by a hash of
// its two cells, and the vein's width swells and pinches along it with value noise, so the
// pattern reads as branching mineral veins of varying width, not great-circle stripes.

import type { Rng, Vec3 } from '@developerz.ai/ts23d';
import { valueNoise } from '@developerz.ai/ts23d';

/** 32-bit integer hash of three cell coordinates and a seed, 0..1. */
function hash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Ore weight 0..1 at a surface point: 1 in a vein's core, fading through its halo. */
export type Veins = (p: Vec3) => number;

/**
 * The vein field. `cell` sets the fracture spacing (m), `fill` the fraction of fracture faces
 * holding ore, `width` the core half-width (m) before swelling, `halo` the soft edge (m).
 */
export function fractureVeins(
  rng: Rng,
  o: { cell: number; fill: number; width: number; halo: number },
): Veins {
  const seed = rng.int(0, 0x7fffffff);
  const swell = valueNoise(rng.fork('swell'), { scale: 1.4, octaves: 2 });
  const bend = valueNoise(rng.fork('bend'), { scale: 2.2, octaves: 2 });
  const site = (i: number, j: number, k: number): Vec3 => [
    (i + 0.15 + 0.7 * hash(i, j, k, seed)) * o.cell,
    (j + 0.15 + 0.7 * hash(i, j, k, seed ^ 0x51ed27)) * o.cell,
    (k + 0.15 + 0.7 * hash(i, j, k, seed ^ 0x2a9b13)) * o.cell,
  ];
  return (p) => {
    // A gentle warp so the fracture planes undulate instead of meeting as crisp polyhedra.
    const w = 0.35 * o.cell * bend(p);
    const q: Vec3 = [p[0] + w, p[1] - w * 0.6, p[2] + w * 0.4];
    const ci = Math.floor(q[0] / o.cell);
    const cj = Math.floor(q[1] / o.cell);
    const ck = Math.floor(q[2] / o.cell);
    // Nearest and second-nearest sites, with their cells.
    let d1 = 1e9;
    let d2 = 1e9;
    let a: Vec3 = [0, 0, 0];
    let b: Vec3 = [0, 0, 0];
    let ia: Vec3 = [0, 0, 0];
    let ib: Vec3 = [0, 0, 0];
    for (let i = ci - 1; i <= ci + 1; i++)
      for (let j = cj - 1; j <= cj + 1; j++)
        for (let k = ck - 1; k <= ck + 1; k++) {
          const s = site(i, j, k);
          const dx = q[0] - s[0];
          const dy = q[1] - s[1];
          const dz = q[2] - s[2];
          const d = dx * dx + dy * dy + dz * dz;
          if (d < d1) {
            d2 = d1;
            b = a;
            ib = ia;
            d1 = d;
            a = s;
            ia = [i, j, k];
          } else if (d < d2) {
            d2 = d;
            b = s;
            ib = [i, j, k];
          }
        }
    // Distance to the bisecting plane of the two nearest sites: the fracture face.
    const n: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
    const m: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dist = Math.abs(
      ((q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1] + (q[2] - m[2]) * n[2]) / nl,
    );
    // The face is filled by a symmetric hash of its two cells.
    const lo = ia[0] + ia[1] * 7 + ia[2] * 49 < ib[0] + ib[1] * 7 + ib[2] * 49 ? ia : ib;
    const hi = lo === ia ? ib : ia;
    const filled = hash(lo[0] * 3 + hi[0], lo[1] * 3 + hi[1], lo[2] * 3 + hi[2], seed ^ 0x7f4a7c15);
    if (filled > o.fill) return 0;
    // Swell and pinch along the vein: 0.25× to 1.6× the core width.
    const half = o.width * Math.max(0.25, 0.9 + 0.9 * swell(p));
    if (dist <= half) return 1;
    const t = Math.min(1, (dist - half) / o.halo);
    return 1 - t * t * (3 - 2 * t);
  };
}
