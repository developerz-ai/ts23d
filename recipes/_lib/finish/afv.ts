// Graded field dirt for tracked vehicles (T-34, Tiger I, the RTS light tank). Dirt lies where it
// lands: dried mud opaque at the ground and fading out with height (higher behind the tracks),
// wet mud under it, a dust haze only on plates that look at the sky, soot fanning up from an
// exhaust mouth. Every mask is a smooth field of height and normal, never coverage patches: a
// patchy all-over layer reads as sprayed camouflage, and a smooth field survives a far LOD's
// corners. Wheels get radial dirt (dark tyre, mud in the outer dish, clean hub) that turns with
// them. Pure vertex-colour work on finished meshes.

import type { Mesh, Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import { smooth, tint } from './field.ts';

const SOOT: Vec3 = [0.012, 0.011, 0.01];

export interface Earths {
  /** Dried mud: pick it against the paint (pale on dark green, dark on sand yellow). */
  readonly earth: Vec3;
  /** Wet mud, lowest on the hull. */
  readonly wet: Vec3;
  /** Road dust settled on top plates. */
  readonly dust: Vec3;
}

export interface Grade {
  /** World offset of a part authored round its own pivot. */
  readonly at?: Vec3;
  /** Dried mud is opaque at the ground and gone at this height (m); a third higher at the rear. */
  readonly mud?: number;
  readonly mudStrength?: number;
  /** The band fades out over this many metres below its top. Default: 0.8 of the band. */
  readonly mudFade?: number;
  /** Dust on plates that face the sky (0..1): an even haze, a little thicker in `grain`'s lows. */
  readonly dust?: number;
  /** Exhaust mouths: soot fans up and back from each. */
  readonly soot?: readonly { at: Vec3; radius: number; strength: number }[];
}

/**
 * How much dried mud a point at height `z` carries when the band ends at `top` (0..1): opaque
 * below `top − fade`, gone at `top`. The default fade (0.8 of the band) is a long wash up a low
 * hull; a short one is a splash line on a tall slab side.
 */
export const mudAt = (z: number, top: number, fade = 0.8 * top): number =>
  top <= 0 ? 0 : 1 - smooth(top - Math.min(fade, top), top, z);

/** How much dust a face with normal z `nz` holds: none on walls, all of it on a deck. */
export const dustAt = (nz: number): number => smooth(0.72, 0.96, nz);

/**
 * The dirt pass: `grain` is the ~0.3 m breakup (0..1), `fine` the ~0.1 m one. Order matters: dust
 * first, mud over it, wet mud over that, soot last.
 */
export function fieldGrade(
  grain: (p: Vec3) => number,
  fine: (p: Vec3) => number,
  tones: Earths,
): (m: Mesh, o: Grade) => Mesh {
  return (m, o) => {
    const at = o.at ?? [0, 0, 0];
    let out = m;
    const dust = o.dust ?? 0;
    if (dust > 0)
      out = tint(out, tones.dust, (p, n) => dust * dustAt(n[2]) * (0.8 + 0.2 * grain(p)), at);
    const mud = o.mud ?? 0;
    if (mud > 0) {
      const k = o.mudStrength ?? 0.9;
      // The tracks throw it backwards: the band stands a third higher at the tail.
      const top = (p: Vec3): number =>
        mud * (p[0] < 0 ? 1 + Math.min(0.35, -p[0] * 0.12) : 1) * (0.82 + 0.36 * grain(p));
      out = tint(
        out,
        tones.earth,
        (p) => k * mudAt(p[2], top(p), o.mudFade) * (0.85 + 0.15 * fine(p)),
        at,
      );
      out = tint(
        out,
        tones.wet,
        (p) => 0.7 * k * mudAt(p[2], 0.42 * top(p)) * (0.7 + 0.3 * fine(p)),
        at,
      );
    }
    for (const s of o.soot ?? [])
      out = tint(
        out,
        SOOT,
        (p) => {
          // Twice as far up as down, twice as far back as forward: a fan, not a disc.
          const dx = (p[0] - s.at[0]) * (p[0] < s.at[0] ? 0.7 : 1.6);
          const dz = (p[2] - s.at[2]) * (p[2] > s.at[2] ? 0.5 : 1.3);
          const d = dmath.hypot(dx, p[1] - s.at[1], dz) / s.radius;
          return d < 1 ? s.strength * (1 - smooth(0.3, 1, d + 0.2 * (grain(p) - 0.5))) : 0;
        },
        at,
      );
    return out;
  };
}

export interface WheelDirt {
  /** Rim radius (m): the wheel spins about Y through its own origin. */
  readonly r: number;
  /** The tyre's vertex colour as built (after `restrip`): those vertices stay dark. */
  readonly tyre: Vec3;
  readonly earth: Vec3;
  readonly noise: (p: Vec3) => number;
  /** Mud in the outer dish (0..1). Default 0.85. */
  readonly strength?: number;
  /**
   * Far LOD: every disc vertex takes this much earth (the area mean of the near wheel's dish)
   * instead of the radial mask, so a disc that is one polygon is one colour block.
   */
  readonly flat?: number;
}

const near = (m: Mesh, i: number, c: Vec3): boolean =>
  [0, 1, 2].every((k) => Math.abs((m.colors[i * 3 + k] ?? 0) - (c[k] ?? 0)) < 2e-3);

/** Mud weight on a wheel disc at radius fraction `rad` (0 hub … 1 rim): hub clean, dish packed. */
export const dishMud = (rad: number): number => smooth(0.46, 0.74, rad);

/**
 * Dirt on a spinning wheel, the same all the way round so it turns with the wheel: the rubber
 * tyre keeps its dark value under a thin dusting (it is scrubbed by the track), dried mud packs
 * the outer dish with a ragged inner edge, the hub and its bolts stay in paint.
 */
export function wheelDirt(m: Mesh, o: WheelDirt): Mesh {
  const colors = new Float32Array(m.colors);
  const k = o.strength ?? 0.85;
  for (let i = 0; i < m.positions.length / 3; i++) {
    const p: Vec3 = [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const w = near(m, i, o.tyre)
      ? 0.22
      : (o.flat ?? k * dishMud(dmath.hypot(p[0], p[2]) / o.r + 0.3 * (o.noise(p) - 0.5)));
    for (let c = 0; c < 3; c++)
      colors[i * 3 + c] =
        (colors[i * 3 + c] ?? 0) + ((o.earth[c] ?? 0) - (colors[i * 3 + c] ?? 0)) * w;
  }
  return { ...m, colors };
}

/** Area mean of `dishMud` over a disc face out to `rim` (fraction of r): the far LOD's `flat`. */
export function meanDishMud(rim: number, strength = 0.85): number {
  let sum = 0;
  let area = 0;
  for (let i = 0; i < 64; i++) {
    const rad = ((i + 0.5) / 64) * rim;
    sum += dishMud(rad) * rad;
    area += rad;
  }
  return (strength * sum) / area;
}
