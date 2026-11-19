// Reading distance for weathering (`read`). The default looks are sized for a close view: chips
// and rust 3 cm across, mud 7 cm, a 35 cm splash band. On a 3 m object framed whole (the hero
// render, a game camera) that is speckle a few pixels wide and the faces between read clean.
// `read: 'hero'` sizes the same effects to the target: patches at least 6 % of its longest side
// (a hand wide on a 2 m crate, 40 cm on a tank), a splash band a quarter of its height, default
// coverage × 1.6, rust streaks half its height, and a graded wash under the patches (mud
// fading up from the ground, dust on what faces the sky, bleach where the sun reaches), so a
// protected face and an exposed one differ at any distance. Declared amounts are still met
// exactly by the patches; the wash is extra and is not counted as coverage.

import type { Mesh } from '../core/index.ts';
import type { WeatheringOptions } from './weather-types.ts';

/** How one weathering run is scaled for its reading distance. */
export interface Read {
  /** Smallest noise feature, metres (a look's own cell when larger). */
  readonly cell: number;
  /** 0..1 share of an effect's strength laid as a graded wash over its whole eligible surface. */
  readonly wash: number;
  /** Multiplier on default amounts (an explicit `amount` is never scaled). */
  readonly amount: number;
  /** Default longest rust streak, metres. */
  readonly streak: number;
  /** Default splash band above the ground, metres. */
  readonly band: number;
}

/** The scale for `o.read` over `mesh`, or null for the default close reading. */
export function readOf(o: WeatheringOptions, mesh: Mesh): Read | null {
  if (o.read !== 'hero') return null;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i++) {
    const v = mesh.positions[i] ?? 0;
    lo[i % 3] = Math.min(lo[i % 3] ?? v, v);
    hi[i % 3] = Math.max(hi[i % 3] ?? v, v);
  }
  const size = [0, 1, 2].map((k) => Math.max(0, (hi[k] ?? 0) - (lo[k] ?? 0)));
  const extent = Math.max(...size);
  const height = size[2] ?? 0;
  return {
    cell: 0.06 * extent,
    wash: 0.8,
    amount: 1.6,
    streak: Math.max(0.35, height / 2),
    band: Math.max(0.35, height / 4),
  };
}
