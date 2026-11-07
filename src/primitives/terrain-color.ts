// Vertex colour for terrain from what shapes real mountainsides: altitude bands (forest below the
// treeline, meadow above it, bare debris higher up), slope (rock where it is too steep to hold
// soil or snow), hydraulic deposit (scree fans and valley gravel) and flow (damp, dark gullies),
// and snow above the snowline on slopes gentle enough to hold it. Returns `(x, y, z) => colour`
// for `heightfield`'s `color`. Boundaries are jittered by an optional noise so bands never read as
// contour lines.

import type { Vec3 } from '../core/index.ts';
import type { Noise2 } from './noise.ts';
import { sampler, slopeMap, type TerrainGrid } from './terrain-grid.ts';

export interface TerrainPalette {
  readonly forest: Vec3;
  readonly grass: Vec3;
  /** Alpine debris/tundra above the meadows and on deposits. */
  readonly scree: Vec3;
  readonly rock: Vec3;
  readonly snow: Vec3;
  /** Damp ground in gullies and river beds. */
  readonly wet: Vec3;
}

export interface TerrainColorOptions {
  readonly palette: TerrainPalette;
  /** Altitude of z = 0 in metres above sea level (z is relative to it). Default 0. */
  readonly datum?: number;
  /** Altitude where forest gives way to meadow, m. */
  readonly treeline: number;
  /** Altitude above which snow lies on gentle slopes, m. */
  readonly snowline: number;
  /** Slope (rise/run) where bare rock takes over: default 0.8 (≈ 39°). */
  readonly rockSlope?: number;
  /** Steepest slope that holds snow: default 1.0 (45°). */
  readonly snowSlope?: number;
  /** Noise in [−1, 1] (metres in) jittering every boundary; `jitter` = its altitude reach, m. */
  readonly noise?: Noise2;
  readonly jitter?: number;
}

const ramp = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function terrainColor(
  g: TerrainGrid,
  o: TerrainColorOptions,
): (x: number, y: number, z: number) => Vec3 {
  const slope = sampler(g, slopeMap(g));
  const flow = g.flow ? sampler(g, g.flow) : () => 0;
  const dep = g.deposit ? sampler(g, g.deposit) : () => 0;
  const P = o.palette;
  const datum = o.datum ?? 0;
  const rockS = o.rockSlope ?? 0.8;
  const snowS = o.snowSlope ?? 1;
  const jit = o.jitter ?? 60;
  const c = [0, 0, 0];
  const mix = (to: Vec3, w: number): void => {
    for (let k = 0; k < 3; k++) c[k] = (c[k] ?? 0) + ((to[k] ?? 0) - (c[k] ?? 0)) * w;
  };
  return (x, y, z) => {
    const n = o.noise ? o.noise(x, y) : 0;
    const alt = z + datum + n * jit;
    const s = slope(x, y) * (1 + 0.15 * n);
    c[0] = P.forest[0];
    c[1] = P.forest[1];
    c[2] = P.forest[2];
    mix(P.grass, ramp(o.treeline - 80, o.treeline + 80, alt));
    mix(P.scree, 0.85 * ramp(o.treeline + 350, o.treeline + 800, alt));
    // Forest thins on steep ground well below the treeline too.
    mix(P.grass, ramp(0.55, 0.8, s) * (1 - ramp(o.treeline - 80, o.treeline + 80, alt)) * 0.6);
    // Scree: sediment dropped on sloping ground (fans, cones); flat floors stay vegetated.
    mix(
      P.scree,
      ramp(0.4, 0.8, dep(x, y)) * ramp(0.2, 0.45, s) * (1 - ramp(rockS, rockS + 0.3, s)),
    );
    mix(P.wet, 0.7 * ramp(0.35, 0.8, flow(x, y)) * (1 - ramp(o.snowline - 100, o.snowline, alt)));
    mix(P.rock, ramp(rockS - 0.15, rockS + 0.15, s));
    mix(
      P.snow,
      ramp(o.snowline - 60, o.snowline + 120, alt) * (1 - ramp(snowS - 0.3, snowS + 0.2, s)),
    );
    return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
  };
}
