// Wear as vertex colour for a wild animal (wolf, fox, bear share it): mud caked on the paws and
// splashed up the lower legs, damp darker fur below it and under the belly, dust or snow settled
// on the up-facing coat, matted streaks on the flanks, healed scars as pale hairless lines. Every
// layer is a function of the world point and normal, so body, fur cards, head and claws take the
// same stain where they meet and every LOD keeps the read. Hash noise only: no randomness.

import type { Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';
import {
  type Matted,
  type Mud,
  mattedAt,
  mudAt,
  noise3,
  type Scar,
  scarAt,
  smooth,
  toSegment,
} from './wild-marks.ts';

export { noise3, type Scar, smooth } from './wild-marks.ts';

export interface WearSpec {
  readonly seed?: number;
  /** Mud: caked to a ragged edge about `top` × ⅔ (metres above ground), splashed in flecks to
   *  2 × `top`. `colour` is the dried crust; where it lies thick it is wet, half as bright. */
  readonly mud?: Mud;
  /** Wet fur: darker below `top` and on the underside below `belly` (metres). */
  readonly damp?: { readonly top: number; readonly belly?: number; readonly strength?: number };
  /** Dust, pollen or snow lying on up-facing fur above `above` metres. */
  readonly settle?: {
    readonly colour: Vec3;
    readonly strength: number;
    readonly above: number;
    /** Patch size, metres (default 0.06). */
    readonly patch?: number;
    /** 0..1 share of it at a point (default 1): keep it off a brush or a face. */
    readonly mask?: (p: Vec3) => number;
  };
  /** Matted, clumped fur: darker streaks along gravity inside the spheres (|y| mirrored). */
  readonly matted?: Matted;
  /** Worn or stained patches (a rubbed shoulder, a singed flank): a tint with a ragged edge. */
  readonly patches?: readonly {
    readonly at: Vec3;
    readonly radius: number;
    readonly colour: Vec3;
    readonly strength: number;
    /** false: near meshes only (a pale patch on the far mesh's flat cells reads as a slab). */
    readonly far?: boolean;
  }[];
  readonly scars?: readonly Scar[];
  /**
   * Healed scar tissue: a colour (default a pale grey-pink), or a function of the coat under it
   * (regrowth: the coat a shade paler and greyer, so the line reads healed, not painted).
   */
  readonly scarColour?: Vec3 | ((coat: Vec3) => Vec3);
}

export type WearPaint = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * 0..1 inside the flesh of a limb chain: 1 within `radius` of the polyline (|y| mirrored), fading
 * to 0 at 1.6 × `radius`. Colour blocks that follow a leg (stockings, a thigh) are placed with it.
 */
export function nearChain(points: readonly Vec3[], radius: number): (p: Vec3) => number {
  return (p) => {
    const q: Vec3 = [p[0], Math.abs(p[1]), p[2]];
    let best = Infinity;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i] ?? q;
      const b = points[i + 1] ?? a;
      best = Math.min(
        best,
        toSegment(q, [a[0], Math.abs(a[1]), a[2]], [b[0], Math.abs(b[1]), b[2]]).d,
      );
    }
    return smooth(radius * 1.6, radius, best);
  };
}

/**
 * The wear layers as one colour function: settle → matted → damp → mud → patches → scars.
 * `coarse` (a far mesh, cells wider than a streak): only the broad layers, with smooth edges —
 * flecks, streaks and scars sampled on 5 cm cells land as stray light and dark triangles.
 */
export function wearPaint(w: WearSpec, coarse = false): WearPaint {
  const salt = w.seed ?? 1;
  const scar = w.scarColour ?? [0.36, 0.27, 0.25];
  const scarColour = typeof scar === 'function' ? scar : (): Vec3 => scar;
  return (p, n, c0) => {
    let c = c0;
    const [x, y, z] = p;
    if (w.settle && z > w.settle.above && !coarse) {
      const size = w.settle.patch ?? 0.06;
      const patch = noise3(x / size, y / size, z / size, salt + 11);
      const fine = noise3(x / (size * 0.2), y / (size * 0.2), z / (size * 0.2), salt + 12);
      const k = smooth(0.35, 0.85, n[2]) * smooth(0.3, 0.62, patch * 0.7 + fine * 0.3);
      c = mix(c, w.settle.colour, k * w.settle.strength * (w.settle.mask?.(p) ?? 1));
    }
    if (w.matted && !coarse) {
      const k = mattedAt(w.matted, p, salt);
      if (k > 0) c = mix(c, [c[0] * 0.42, c[1] * 0.4, c[2] * 0.38], k * w.matted.strength);
    }
    if (w.damp) {
      const edge = (noise3(x / 0.03, y / 0.03, z / 0.05, salt + 31) - 0.5) * w.damp.top * 0.5;
      const legs = smooth(w.damp.top, w.damp.top * 0.45, z + edge);
      const under =
        w.damp.belly !== undefined
          ? smooth(-0.2, -0.75, n[2]) * smooth(w.damp.belly, w.damp.belly * 0.8, z + edge)
          : 0;
      const k = Math.max(legs, under) * (w.damp.strength ?? 0.35);
      // Wet fur: darker and a touch more saturated (water fills the scatter between hairs).
      const g = (c[0] + c[1] + c[2]) / 3;
      c = [
        (c[0] + (c[0] - g) * 0.25 * k) * (1 - k),
        (c[1] + (c[1] - g) * 0.25 * k) * (1 - k),
        (c[2] + (c[2] - g) * 0.25 * k) * (1 - k),
      ];
    }
    if (w.mud && z < w.mud.top * 2.2) {
      const { level, caked, splash } = mudAt(w.mud, p, salt, coarse);
      // Wet and near-black on the toes, the crust drying to the clay's colour up the leg; a
      // splash is half dry. Never paler than the clay: a chalky fleck reads as a texture hole.
      const wet: Vec3 = [w.mud.colour[0] * 0.42, w.mud.colour[1] * 0.4, w.mud.colour[2] * 0.38];
      const dry = smooth(0.15, 0.85, level);
      const k = Math.max(caked, splash * 0.8) * (w.mud.strength ?? 0.85);
      c = mix(c, mix(wet, w.mud.colour, Math.max(dry, splash * 0.5)), k);
    }
    for (const patch of w.patches ?? []) {
      if (coarse && patch.far === false) continue;
      const d = dmath.hypot(x - patch.at[0], y - patch.at[1], z - patch.at[2]) / patch.radius;
      if (d >= 1.3) continue;
      const ragged = noise3(x / 0.02, y / 0.02, z / 0.02, salt + 61) * 0.5;
      c = mix(c, patch.colour, smooth(1, 0.45, d + ragged - 0.25) * patch.strength);
    }
    for (const s of coarse ? [] : (w.scars ?? [])) {
      const at = scarAt(s, p, salt);
      if (!at) continue;
      // Tapered ends; a bare pale core with the parted fur darker either side of it.
      const coat = c;
      c = mix(c, [c[0] * 0.55, c[1] * 0.52, c[2] * 0.5], at.rim * 0.6);
      c = mix(c, scarColour(coat), at.core * 0.9);
    }
    return c;
  };
}

export interface Locks {
  /** Width of one lock across the coat's lie, metres (≥ 2.5 sculpt cells, or it aliases). */
  readonly size: number;
  /** Tone swing 0..1 `lockPaint` shades with: lit locks × (1 + ½ s), the partings × (1 − s). */
  readonly strength: number;
  /** Lock length ÷ width (default 6). */
  readonly stretch?: number;
  readonly seed?: number;
}

/**
 * Clumped locks as tone, −1 (the shadowed parting between two locks) … +1 (a lit lock): value
 * noise stretched along the coat's lie `dir`, a coarse octave for the clumps and a finer one for
 * the strands in them. Painted on the skin under the cards, so the coat between the cards reads
 * as fur lying along the body and not as a smooth painted shell. The tone only: `lockPaint` applies
 * it at `o.strength`.
 */
export function lockTone(dir: (p: Vec3) => Vec3, o: Locks): (p: Vec3) => number {
  const salt = (o.seed ?? 1) + 71;
  const squash = 1 / (o.stretch ?? 6) - 1;
  return (p) => {
    const d = dir(p);
    const ll = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
    // The point with its component along the lie shrunk: noise cells become long along it.
    const k = (squash * (p[0] * d[0] + p[1] * d[1] + p[2] * d[2])) / ll;
    const q: Vec3 = [
      (p[0] + d[0] * k) / o.size,
      (p[1] + d[1] * k) / o.size,
      (p[2] + d[2] * k) / o.size,
    ];
    const clump = noise3(q[0], q[1], q[2], salt);
    const strand = noise3(q[0] * 2.3, q[1] * 2.3, q[2] * 2.3, salt + 1);
    return smooth(0.3, 0.7, clump * 0.65 + strand * 0.35) * 2 - 1;
  };
}

/** The locks painted: a colour shaded by `lockTone` at the swing its `Locks` carry (`strength`). */
export function lockPaint(dir: (p: Vec3) => Vec3, o: Locks): (p: Vec3, c: Vec3) => Vec3 {
  const tone = lockTone(dir, o);
  return (p, c) => lockShade(c, tone(p), o.strength);
}

/** A colour under the lock tone `t` (−1..1): partings darker and a touch richer, locks paler. */
export function lockShade(c: Vec3, t: number, strength: number): Vec3 {
  const k = t < 0 ? 1 + t * strength : 1 + t * strength * 0.5;
  const g = (c[0] + c[1] + c[2]) / 3;
  const sat = t < 0 ? 1 - t * strength * 0.25 : 1;
  return [(g + (c[0] - g) * sat) * k, (g + (c[1] - g) * sat) * k, (g + (c[2] - g) * sat) * k];
}
