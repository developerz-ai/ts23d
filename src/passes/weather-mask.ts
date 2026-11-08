// %: seeded masks that hit a declared coverage exactly. A world-space value noise (hashed lattice,
// seeded, no Math.random) scores every eligible vertex; vertices are taken best-first until their
// area reaches `amount` × eligible area, the last one partially. Position-seeded, so LOD0 and LOD1
// grow the same patches; area-weighted, so coverage means surface, not vertex count.

/** Integer hash → [0, 1). */
const h3 = (seed: number, x: number, y: number, z: number): number => {
  let h = seed ^ Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Trilinear value noise at (x, y, z) in lattice units, [0, 1). */
export function valueNoise3(seed: number, x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const fz = fade(z - zi);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => h3(seed, xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy),
    l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

/** Three octaves of value noise; `cell` = feature size in metres, `stretch` scales axes. */
export function fbm(
  seed: number,
  p: readonly [number, number, number],
  cell: number,
  stretch: readonly [number, number, number] = [1, 1, 1],
): number {
  let sum = 0;
  let amp = 0.55;
  let f = 1 / cell;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    sum +=
      amp *
      valueNoise3(
        seed + o * 7919,
        p[0] * f * stretch[0],
        p[1] * f * stretch[1],
        p[2] * f * stretch[2],
      );
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export interface Coverage {
  /** Per vertex 0..1: 1 = covered, fractional only at the threshold vertex. */
  readonly mask: Float32Array;
  readonly eligibleArea: number;
  readonly actual: number;
}

/**
 * Cover `amount` of the eligible area (weight ≥ 0.5), highest `score` first. Ties break by vertex
 * index (stable sort), so the result is deterministic.
 */
export function cover(
  weight: Float32Array,
  score: Float32Array,
  area: Float64Array,
  amount: number,
): Coverage {
  const mask = new Float32Array(weight.length);
  const order: number[] = [];
  let eligibleArea = 0;
  for (let v = 0; v < weight.length; v++) {
    if ((weight[v] ?? 0) < 0.5) continue;
    order.push(v);
    eligibleArea += area[v] ?? 0;
  }
  if (eligibleArea <= 0) return { mask, eligibleArea: 0, actual: 0 };
  order.sort((a, b) => (score[b] ?? 0) - (score[a] ?? 0) || a - b);
  const want = Math.min(1, Math.max(0, amount)) * eligibleArea;
  let got = 0;
  for (const v of order) {
    if (got >= want) break;
    const a = area[v] ?? 0;
    const take = a > 0 ? Math.min(1, (want - got) / a) : 1;
    mask[v] = take;
    got += a * take;
  }
  return { mask, eligibleArea, actual: got / eligibleArea };
}

/** Area-weighted fraction of `mask` over the vertices where `where` holds (≥ 0.5). */
export function measured(mask: Float32Array, where: Float32Array, area: Float64Array): number {
  let num = 0;
  let den = 0;
  for (let v = 0; v < mask.length; v++) {
    if ((where[v] ?? 0) < 0.5) continue;
    den += area[v] ?? 0;
    num += (area[v] ?? 0) * (mask[v] ?? 0);
  }
  return den > 0 ? num / den : 0;
}
