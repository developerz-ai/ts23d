// Flow paths: rain runs rust down a surface. From every rusted source group a path steps to the
// neighbour with the steepest drop (gravity projected on the surface, a little seeded meander), never
// sideways or up, until it runs `length` metres, reaches a flat top, or drips off an underside.
// Intensity fades along the path. Every step is checked: `upward` counts any rising segment (0).

import type { Surface } from './weather-surface.ts';

export interface Streaks {
  /** Per group 0..1 streak intensity. */
  readonly level: Float32Array;
  readonly segments: number;
  readonly upward: number;
}

export function traceStreaks(
  s: Surface,
  sources: Float32Array,
  length: number,
  meander: (g: number) => number,
): Streaks {
  const level = new Float32Array(s.groups);
  const z = (g: number): number => s.gp[g * 3 + 2] ?? 0;
  // Groups facing straight down drip off: the path ends there.
  const gnz = new Float32Array(s.groups);
  const cnt = new Uint16Array(s.groups);
  for (let v = 0; v < s.vertices; v++) {
    const g = s.group[v] ?? 0;
    gnz[g] = (gnz[g] ?? 0) + (s.mesh.normals[v * 3 + 2] ?? 0);
    cnt[g] = (cnt[g] ?? 0) + 1;
  }
  // Drips: where a path runs off an edge (a bolt head, a sill), the water falls straight down
  // onto the first upward- or side-facing surface within 10 cm and keeps running there.
  const CELL = 0.025;
  const cellOf = (x: number, y: number): string =>
    `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
  const cells = new Map<string, number[]>();
  for (let g = 0; g < s.groups; g++) {
    if ((gnz[g] ?? 0) / Math.max(1, cnt[g] ?? 1) < -0.3) continue;
    const k = cellOf(s.gp[g * 3] ?? 0, s.gp[g * 3 + 1] ?? 0);
    const list = cells.get(k);
    if (list) list.push(g);
    else cells.set(k, [g]);
  }
  const drip = (from: number): number => {
    const x = s.gp[from * 3] ?? 0;
    const y = s.gp[from * 3 + 1] ?? 0;
    const zf = z(from);
    let best = -1;
    let bestZ = -Infinity;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of cells.get(cellOf(x + dx * CELL, y + dy * CELL)) ?? []) {
          const zq = z(q);
          if (s.piece[q] === s.piece[from] || zq >= zf - 1e-4 || zq < zf - 0.1) continue;
          if (Math.hypot((s.gp[q * 3] ?? 0) - x, (s.gp[q * 3 + 1] ?? 0) - y) > CELL) continue;
          if (zq > bestZ) {
            bestZ = zq;
            best = q;
          }
        }
    return best;
  };
  let segments = 0;
  let upward = 0;
  for (let src = 0; src < s.groups; src++) {
    if ((sources[src] ?? 0) < 0.5) continue;
    let cur = src;
    let run = 0;
    for (let step = 0; step < 400 && run < length; step++) {
      let best = -1;
      let bestScore = 0.35; // must fall at least this steeply (slope) to keep flowing
      for (let i = s.nbrStart[cur] ?? 0; i < (s.nbrStart[cur + 1] ?? 0); i++) {
        const q = s.nbr[i] ?? 0;
        const dz = z(q) - z(cur);
        if (dz >= -1e-6) continue;
        const d = Math.hypot(
          (s.gp[q * 3] ?? 0) - (s.gp[cur * 3] ?? 0),
          (s.gp[q * 3 + 1] ?? 0) - (s.gp[cur * 3 + 1] ?? 0),
          dz,
        );
        const score = -dz / d + 0.3 * (meander(q) - 0.5);
        if (score > bestScore) {
          bestScore = score;
          best = q;
        }
      }
      if (best < 0 || (gnz[cur] ?? 0) / Math.max(1, cnt[cur] ?? 1) < -0.6) best = drip(cur);
      if (best < 0) break;
      const dz = z(best) - z(cur);
      if (dz > 0) upward++;
      segments++;
      run += Math.hypot(
        (s.gp[best * 3] ?? 0) - (s.gp[cur * 3] ?? 0),
        (s.gp[best * 3 + 1] ?? 0) - (s.gp[cur * 3 + 1] ?? 0),
        dz,
      );
      const fadeOut = Math.max(0, 1 - run / length) ** 0.7;
      level[best] = Math.max(level[best] ?? 0, fadeOut);
      cur = best;
    }
  }
  // A streak is wider than one vertex: its side neighbours take half.
  const wide = Float32Array.from(level);
  for (let g = 0; g < s.groups; g++) {
    const l = level[g] ?? 0;
    if (l <= 0) continue;
    for (let i = s.nbrStart[g] ?? 0; i < (s.nbrStart[g + 1] ?? 0); i++) {
      const q = s.nbr[i] ?? 0;
      if (Math.abs(z(q) - z(g)) < 1e-4) wide[q] = Math.max(wide[q] ?? 0, l * 0.5);
    }
  }
  return { level: wide, segments, upward };
}
