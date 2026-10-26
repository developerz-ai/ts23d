// Play-mode ground shape: a few hundred metres of rolling hills from seeded value noise, flattened
// where the town, the rail loop, the landmark and the start area sit, with darker dirt tracks.
// Pure math (no three.js, no library), shared by the worker that builds the terrain mesh and the
// page that drives on it.

import { fbm, smoothstep } from '../noise.ts';

const SEED = 1943;
export const EXTENT = 200; // metres from centre to edge
export const CHUNK = 50;

/** Flat zones, authoring coordinates (x east, y north; world Z = -y). */
export const TOWN_Y = 45;
export const RAIL = { x: -70, y: -70, r: 30 } as const;
/** A flattened rise on the skyline for landmarks (towers, monuments). */
export const LANDMARK = { x: -150, y: 150 } as const;

const disc = (x: number, y: number, cx: number, cy: number, r0: number, r1: number): number =>
  1 - smoothstep(r0, r1, Math.hypot(x - cx, y - cy));

function flatness(x: number, y: number): number {
  const band = Math.hypot(Math.max(0, Math.abs(y - TOWN_Y) - 14), Math.max(0, Math.abs(x) - 130));
  return Math.max(
    disc(x, y, 0, 0, 35, 85),
    1 - smoothstep(0, 30, band),
    disc(x, y, RAIL.x, RAIL.y, 42, 64),
    disc(x, y, LANDMARK.x, LANDMARK.y, 70, 100),
  );
}

/** Track wear 0..1: a ring road round the start, the town street, and a track out east. */
export function dirt(x: number, y: number): number {
  const d = Math.min(
    Math.abs(Math.hypot(x, y) - 60),
    Math.abs(x) < 130 ? Math.abs(y - TOWN_Y) : 99,
    x > 0 ? Math.abs(y + 8) : 99,
  );
  return 1 - smoothstep(2.2, 4.5, d);
}

/** Open countryside (not a flat zone, not a track): where trees may grow. */
export const isOpenGround = (x: number, y: number): boolean =>
  flatness(x, y) < 0.15 && dirt(x, y) < 0.05;

/** Ground height at an authoring-space point. The tank samples the same function it is drawn from. */
export function heightAt(x: number, y: number): number {
  const hills = fbm(x / 120, y / 120, SEED) * 16 + fbm(x / 40, y / 40, SEED + 7, 3) * 3.5;
  const f = flatness(x, y);
  const ground = hills * (1 - f) + fbm(x / 30, y / 30, SEED + 3, 2) * 0.35 * f;
  return ground + fbm(x / 7, y / 7, SEED + 11, 2) * 0.12 - dirt(x, y) * 0.1;
}

/** Same thing in three.js world space (Y-up). */
export const groundY = (X: number, Z: number): number => heightAt(X, -Z);
