// Eiffel Tower wear, in vertex colour on the painted iron (the lattice is dense enough to carry
// it). The story is the repaint cycle: the tower is repainted every seven years from the top
// down, so the upper shaft is fresh and even while the lower legs carry the oldest coat — rust
// weeping in vertical runs below the riveted nodes, a dull chalky bloom on up-facing flanges, and
// city grime on the deck tops. Pure hash noise (no generator state): the same vertex always gets
// the same colour, so every LOD and every rebuild agrees.

import type { Vec3 } from '@developerz.ai/ts23d';

/** Integer lattice hash → [0, 1). */
function hash3(x: number, y: number, z: number): number {
  let h =
    Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1) at `p` / `cell` metres (trilinear over the hash lattice). */
export function noise(p: Vec3, cell: Vec3): number {
  const q = [p[0] / cell[0], p[1] / cell[1], p[2] / cell[2]];
  const i = q.map(Math.floor);
  const f = q.map((v, k) => {
    const t = v - (i[k] ?? 0);
    return t * t * (3 - 2 * t);
  });
  let s = 0;
  for (let dx = 0; dx < 2; dx++)
    for (let dy = 0; dy < 2; dy++)
      for (let dz = 0; dz < 2; dz++) {
        const w =
          (dx ? (f[0] ?? 0) : 1 - (f[0] ?? 0)) *
          (dy ? (f[1] ?? 0) : 1 - (f[1] ?? 0)) *
          (dz ? (f[2] ?? 0) : 1 - (f[2] ?? 0));
        s += w * hash3((i[0] ?? 0) + dx, (i[1] ?? 0) + dy, (i[2] ?? 0) + dz);
      }
  return s;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = Math.min(1, Math.max(0, w));
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

const RUST: Vec3 = [0.36, 0.13, 0.04];
const CHALK: Vec3 = [0.42, 0.37, 0.3];
const GRIME: Vec3 = [0.07, 0.065, 0.06];

/**
 * Weathering factor for one vertex of painted iron (multiplies onto its height shade). Below
 * ~120 m: rust runs (noise stretched 15× along z, so a stain runs down a member), blotchy
 * chalking on up-facing faces and road grime on the feet; the upper shaft stays clean and a touch brighter (fresh coat).
 */
export function ironWear(p: Vec3, n: Vec3, c: Vec3): Vec3 {
  const age = 1 - smooth(80, 150, p[2]);
  const runs = noise(p, [1.2, 1.2, 18]);
  const spots = noise(p, [3.5, 3.5, 3.5]);
  let out = mix(c, RUST, 0.85 * age * smooth(0.45, 0.75, runs) * (0.55 + 0.45 * spots));
  out = mix(out, CHALK, 0.4 * age * smooth(0.3, 0.9, n[2]) * smooth(0.4, 0.8, spots));
  // Soot and road grime on the feet: the lowest 12 m of every leg is a shade darker.
  out = mix(out, GRIME, 0.45 * (1 - smooth(2, 14, p[2])));
  // Fresh paint aloft: a little brighter and more even than the shade alone.
  const fresh = smooth(150, 230, p[2]);
  return [out[0] * (1 + 0.12 * fresh), out[1] * (1 + 0.12 * fresh), out[2] * (1 + 0.1 * fresh)];
}

/** Deck tops: soot and foot-traffic grime in blotches, heaviest away from the railings. */
export function deckWear(p: Vec3, n: Vec3, c: Vec3): Vec3 {
  if (n[2] < 0.5) return c;
  const b = noise(p, [4, 4, 4]);
  return mix(c, GRIME, 0.35 + 0.45 * smooth(0.3, 0.8, b));
}
