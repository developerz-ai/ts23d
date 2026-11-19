// Wear as vertex colour for a wild animal (wolf, fox, bear share it): mud caked on the paws and
// splashed up the lower legs, damp darker fur below it and under the belly, dust or snow settled
// on the up-facing coat, matted streaks on the flanks, healed scars as pale hairless lines. Every
// layer is a function of the world point and normal, so body, fur cards, head and claws take the
// same stain where they meet and every LOD keeps the read. Hash noise only: no randomness.

import type { Vec3 } from '@developerz.ai/ts23d';

export interface Scar {
  /** World ends of the healed cut (on the skin; the stroke reaches `width` × 3 into the coat). */
  readonly a: Vec3;
  readonly b: Vec3;
  /** Half-width of the bare line, metres. */
  readonly width: number;
  /**
   * Project along this axis (0 = X, 1 = Y, 2 = Z) instead of measuring in 3D: the stroke lands on
   * whatever skin faces that way within `reach` of the ends (a flank scar: 1; down a muzzle: 2).
   */
  readonly axis?: 0 | 1 | 2;
  /** How far along `axis` from the ends the stroke still marks, metres (default 0.05). */
  readonly reach?: number;
}

export interface WearSpec {
  readonly seed?: number;
  /** Mud: caked below `top` × ⅓, patchy up to `top`, flecks to 1.6 × `top` (metres above ground). */
  readonly mud?: { readonly top: number; readonly colour: Vec3; readonly strength?: number };
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
  readonly matted?: {
    readonly zones: readonly { readonly at: Vec3; readonly radius: number }[];
    readonly strength: number;
    /** Streak width, metres (default 0.012). */
    readonly width?: number;
  };
  /** Worn or stained patches (a rubbed shoulder, a singed flank): a tint with a ragged edge. */
  readonly patches?: readonly {
    readonly at: Vec3;
    readonly radius: number;
    readonly colour: Vec3;
    readonly strength: number;
  }[];
  readonly scars?: readonly Scar[];
  /** Healed scar tissue (default a pale grey-pink). */
  readonly scarColour?: Vec3;
}

export type WearPaint = (p: Vec3, n: Vec3, c: Vec3) => Vec3;

const hash = (n: number, salt: number): number => {
  let h = (n ^ (salt * 374761393)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Trilinear value noise, 0..1. */
export function noise3(x: number, y: number, z: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const s = (t: number): number => t * t * (3 - 2 * t);
  const fx = s(x - ix);
  const fy = s(y - iy);
  const fz = s(z - iz);
  const h = (i: number, j: number, k: number): number =>
    hash(((ix + i) * 73856093) ^ ((iy + j) * 19349663) ^ ((iz + k) * 83492791), salt);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
    l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy),
    fz,
  );
}

export const smooth = (e0: number, e1: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Distance from p to segment a–b and the fraction along it. */
function toSegment(p: Vec3, a: Vec3, b: Vec3): { d: number; t: number } {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ll = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  const t = Math.min(
    1,
    Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / ll),
  );
  return {
    d: Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t),
    t,
  };
}

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

/** The wear layers as one colour function: settle → matted → damp → mud → patches → scars. */
export function wearPaint(w: WearSpec): WearPaint {
  const salt = w.seed ?? 1;
  const scarColour = w.scarColour ?? [0.36, 0.27, 0.25];
  return (p, n, c0) => {
    let c = c0;
    const [x, y, z] = p;
    if (w.settle && z > w.settle.above) {
      const size = w.settle.patch ?? 0.06;
      const patch = noise3(x / size, y / size, z / size, salt + 11);
      const fine = noise3(x / (size * 0.2), y / (size * 0.2), z / (size * 0.2), salt + 12);
      const k = smooth(0.35, 0.85, n[2]) * smooth(0.3, 0.62, patch * 0.7 + fine * 0.3);
      c = mix(c, w.settle.colour, k * w.settle.strength * (w.settle.mask?.(p) ?? 1));
    }
    if (w.matted) {
      const width = w.matted.width ?? 0.012;
      let inside = 0;
      for (const zone of w.matted.zones) {
        const d = Math.hypot(x - zone.at[0], Math.abs(y) - Math.abs(zone.at[1]), z - zone.at[2]);
        inside = Math.max(inside, 1 - (d / zone.radius) ** 2);
      }
      if (inside > 0) {
        // Clumps hang with gravity: narrow across (x), long down (z).
        const streak = noise3(x / width, y / (width * 4), z / (width * 7), salt + 21);
        const k = smooth(0.52, 0.78, streak) * Math.min(1, inside * 1.6);
        c = mix(c, [c[0] * 0.42, c[1] * 0.4, c[2] * 0.38], k * w.matted.strength);
      }
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
    if (w.mud && z < w.mud.top * 1.6) {
      const top = w.mud.top;
      const blot = noise3(x / (top * 0.3), y / (top * 0.3), z / (top * 0.45), salt + 41);
      const caked = smooth(1, 0.2, z / top + (blot - 0.5) * 0.9);
      const fleck = noise3(x / (top * 0.07), y / (top * 0.07), z / (top * 0.07), salt + 42);
      const splash = smooth(0.74, 0.86, fleck) * smooth(top * 1.6, top * 0.6, z) * 0.8;
      // Drying mud is paler at its thin upper edge than where it is caked and still wet.
      const dry = mix(w.mud.colour, [0.32, 0.27, 0.2], smooth(0.3, 0.9, z / top) * 0.45);
      c = mix(c, dry, Math.max(caked, splash) * (w.mud.strength ?? 0.85));
    }
    for (const patch of w.patches ?? []) {
      const d = Math.hypot(x - patch.at[0], y - patch.at[1], z - patch.at[2]) / patch.radius;
      if (d >= 1.3) continue;
      const ragged = noise3(x / 0.02, y / 0.02, z / 0.02, salt + 61) * 0.5;
      c = mix(c, patch.colour, smooth(1, 0.45, d + ragged - 0.25) * patch.strength);
    }
    for (const s of w.scars ?? []) {
      const k = s.axis;
      const flat = (q: Vec3): Vec3 =>
        k === undefined ? q : [k === 0 ? 0 : q[0], k === 1 ? 0 : q[1], k === 2 ? 0 : q[2]];
      if (k !== undefined) {
        const mid = ((s.a[k] ?? 0) + (s.b[k] ?? 0)) / 2;
        if (Math.abs((p[k] ?? 0) - mid) > (s.reach ?? 0.05)) continue;
      }
      const { d, t } = toSegment(flat(p), flat(s.a), flat(s.b));
      if (d > s.width * 3) continue;
      // Tapered ends; a bare pale core with the parted fur darker either side of it.
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.5;
      const wobble = 0.75 + 0.5 * noise3(x / 0.01, y / 0.01, z / 0.01, salt + 51);
      const core = smooth(s.width * taper * wobble, s.width * 0.35 * taper, d);
      const rim = smooth(s.width * 3, s.width, d) * (1 - core) * taper;
      c = mix(c, [c[0] * 0.55, c[1] * 0.52, c[2] * 0.5], rim * 0.6);
      c = mix(c, scarColour, core * 0.9);
    }
    return c;
  };
}
