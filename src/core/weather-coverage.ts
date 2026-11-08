// The measured result of one weathering effect on one weathered target (passes/weather writes
// it via `ctx.weathered`): what the recipe asked for, what the pass produced, and the
// plausibility numbers the QA `weather` gate holds it to. Plain data, so the manifest and the
// gate read it without importing the pass.

import type { Lod } from './part.ts';

export interface WeatherCoverage {
  /** The weathered target's label (`weather(ctx, meshes, { name })`), prefixed through `use`. */
  readonly target: string;
  /** chips, rust, dust, moss, scratches, mud, bleach (coverage) · dents, sag, warp (shape). */
  readonly effect: string;
  /** The selector that chose the eligible surface: 'convex-edges', 'shaded & wet'. */
  readonly where: string;
  readonly lod: Lod;
  /** Coverage effects: target fraction of the eligible area. Dents: depth (m). Sag/warp: max (m). */
  readonly amount: number;
  /** Measured: covered fraction · deepest dent (m) · largest sag/warp displacement (m). */
  readonly actual: number;
  /** Eligible surface area, m². */
  readonly area: number;
  /** Allowed |actual − amount| for coverage effects (default 0.02). */
  readonly tolerance: number;
  /** Fraction of the covered area that sits where physics forbids it (dust under a ledge). */
  readonly misplaced?: number;
  /** Rust streaks: path segments traced, and how many rise (must be 0). */
  readonly streaks?: number;
  readonly upward?: number;
  /** Dents: how many were pressed, and the declared range. */
  readonly count?: number;
  readonly countRange?: readonly [number, number];
}
