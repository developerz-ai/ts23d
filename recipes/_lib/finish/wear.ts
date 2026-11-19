// Small vertex-colour wear kit shared by recipes that age finished meshes by hand: run a shader
// over every vertex (world position, normal, current colour), blend toward a stain, keep a stain
// under a paint slot's colour, and pick a mud tone that reads against the paint. Several recipes
// grew private copies (water_tower, station_halt, signal_gantry, boxcar, loco_440 wear.ts); new
// work imports these instead. Pure colour work: positions, normals and UVs are never touched.

import { hex, type Mesh, type Vec3 } from '@developerz.ai/ts23d';

/** One vertex as a wear shader sees it: world position, normal, current colour → new colour. */
export type Shade = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Hermite step from 0 at `a` to 1 at `b`. */
export function smooth(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** `c` moved toward `to` by `w`, clamped to 0..1 (0 keeps `c`, 1 is `to`). */
export const mix = (c: Vec3, to: Vec3, w: number): Vec3 => {
  const k = clamp01(w);
  return [c[0] + (to[0] - c[0]) * k, c[1] + (to[1] - c[1]) * k, c[2] + (to[2] - c[2]) * k];
};

/**
 * `to` held at or under `cap` in every channel. A paint-slot vertex stores colour ÷ slot colour,
 * so a stain on painted parts may only darken it: cap the stain by the paint.
 */
export const under = (to: Vec3, cap: Vec3): Vec3 => [
  Math.min(to[0], cap[0]),
  Math.min(to[1], cap[1]),
  Math.min(to[2], cap[2]),
];

/**
 * Run `f` over every vertex colour. `at` is the world offset of a part authored round its own
 * pivot, so a height or a sun direction means the same on every part.
 */
export function shade(m: Mesh, f: Shade, at: Vec3 = [0, 0, 0]): Mesh {
  const colors = new Float32Array(m.colors);
  const P = m.positions;
  const N = m.normals;
  for (let i = 0; i < P.length / 3; i++) {
    const p: Vec3 = [
      (P[i * 3] ?? 0) + at[0],
      (P[i * 3 + 1] ?? 0) + at[1],
      (P[i * 3 + 2] ?? 0) + at[2],
    ];
    const n: Vec3 = [N[i * 3] ?? 0, N[i * 3 + 1] ?? 0, N[i * 3 + 2] ?? 1];
    colors.set(
      f(p, n, [colors[i * 3] ?? 0, colors[i * 3 + 1] ?? 0, colors[i * 3 + 2] ?? 0]),
      i * 3,
    );
  }
  return { ...m, colors };
}

/** Linear-light luminance (Rec. 709 weights) of a vertex colour. */
export const luminance = (c: Vec3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Dark loam, wet: the darkest mud `mudFor` gives (luminance ≈ 0.04, never shadow-black). */
export const DARK_EARTH: Vec3 = hex('#4a3a29');
/** Pale dried clay and road dust: the lightest (luminance ≈ 0.23). */
export const PALE_EARTH: Vec3 = hex('#9a8463');

/**
 * Mud that reads against `paint`: pale dried earth on dark paint, dark loam on light paint, a
 * smooth blend between, always inside the believable earth range DARK_EARTH..PALE_EARTH. A fixed
 * near-black mud reads as shadow, not dirt, on every dark finish.
 */
export function mudFor(paint: Vec3): Vec3 {
  const t = smooth(0.05, 0.3, luminance(paint));
  return mix(PALE_EARTH, DARK_EARTH, t);
}
