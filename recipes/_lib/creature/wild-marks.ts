// Where each kind of wear lies, as 0..1 masks of a world point: mud caked on the paws and splashed
// up the legs, matted streaks hanging with gravity, a healed scar's bare core and the parted fur
// either side of it. `wearPaint` (wild-paint.ts) colours with them; `wearKeep` shortens the fur
// cards with the same masks, so a card over caked mud, a matted streak or a scar is the stain's
// shape in the coat and not only a tint on the skin under it. Hash noise only: no randomness.

import type { Vec3 } from '@developerz.ai/ts23d';
import { dmath } from '@developerz.ai/ts23d';

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

export interface Mud {
  readonly top: number;
  readonly colour: Vec3;
  readonly strength?: number;
}

export interface Matted {
  readonly zones: readonly { readonly at: Vec3; readonly radius: number }[];
  readonly strength: number;
  /** Streak width, metres (default 0.012). */
  readonly width?: number;
}

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

/** Distance from p to segment a–b and the fraction along it. */
export function toSegment(p: Vec3, a: Vec3, b: Vec3): { d: number; t: number } {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ll = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  const t = Math.min(
    1,
    Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / ll),
  );
  return {
    d: dmath.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t),
    t,
  };
}

/**
 * Mud at p: `level` (height over `top`, ragged by blots and fray), `caked` (graded from the toes,
 * solid only on the paw) and `splash` (flecks thrown up the leg). Zero above 2.2 × `top`.
 */
export function mudAt(
  m: Mud,
  p: Vec3,
  salt: number,
  coarse: boolean,
): { level: number; caked: number; splash: number } {
  const [x, y, z] = p;
  const top = m.top;
  if (z >= top * 2.2) return { level: z / top, caked: 0, splash: 0 };
  // Graded from the toes, not a sock: solid only on the paw, thinning up the leg through runs
  // narrower than the leg and twice as tall as wide (which carry the edge up and down) to nothing
  // at about `top`, so the leg reads as walked through mud and not as dyed below a hard line.
  const blot = noise3(x / (top * 0.2), y / (top * 0.2), z / (top * 0.4), salt + 41);
  const fray = noise3(x / (top * 0.07), y / (top * 0.07), z / (top * 0.07), salt + 43);
  const level = coarse ? z / top : z / top + (blot - 0.5) * 1.1 + (fray - 0.5) * 0.3;
  const caked = smooth(0.8, 0.3, level);
  // Splashes thrown up the leg: blobs a toe wide, thick low down and thinning with height.
  const fleck = noise3(x / (top * 0.12), y / (top * 0.12), z / (top * 0.12), salt + 42);
  const splash = coarse
    ? 0
    : smooth(0.6, 0.68, fleck - 0.14 * (z / top)) * smooth(top * 2, top * 0.7, z);
  return { level, caked, splash };
}

/** Matted streak at p, 0..1 (before `strength`): clumps hanging with gravity inside the zones. */
export function mattedAt(m: Matted, p: Vec3, salt: number): number {
  const [x, y, z] = p;
  const width = m.width ?? 0.012;
  let inside = 0;
  for (const zone of m.zones) {
    const d = dmath.hypot(x - zone.at[0], Math.abs(y) - Math.abs(zone.at[1]), z - zone.at[2]);
    inside = Math.max(inside, 1 - dmath.pow(d / zone.radius, 2));
  }
  if (inside <= 0) return 0;
  // Clumps hang with gravity: narrow across (x), long down (z).
  const streak = noise3(x / width, y / (width * 4), z / (width * 7), salt + 21);
  return smooth(0.52, 0.78, streak) * Math.min(1, inside * 1.6);
}

/** A scar at p: the bare pale `core` and the parted, darker `rim` either side; null off it. */
export function scarAt(s: Scar, p: Vec3, salt: number): { core: number; rim: number } | null {
  const k = s.axis;
  const flat = (q: Vec3): Vec3 =>
    k === undefined ? q : [k === 0 ? 0 : q[0], k === 1 ? 0 : q[1], k === 2 ? 0 : q[2]];
  if (k !== undefined) {
    const mid = ((s.a[k] ?? 0) + (s.b[k] ?? 0)) / 2;
    if (Math.abs((p[k] ?? 0) - mid) > (s.reach ?? 0.05)) return null;
  }
  const { d, t } = toSegment(flat(p), flat(s.a), flat(s.b));
  if (d > s.width * 3) return null;
  // At (and past) an end the stroke has tapered to nothing (and smooth(0, 0, d) is undefined).
  if (t <= 0 || t >= 1) return null;
  const taper = Math.sqrt(dmath.sin(Math.PI * t));
  const wobble = 0.75 + 0.5 * noise3(p[0] / 0.01, p[1] / 0.01, p[2] / 0.01, salt + 51);
  const core = smooth(s.width * taper * wobble, s.width * 0.35 * taper, d);
  const rim = smooth(s.width * 3, s.width, d) * (1 - core) * taper;
  return { core, rim };
}

/** Share of a fur card's length kept where each wear lies (1 = untouched, 0 = gone). */
export interface CardKeep {
  /** Over caked mud: the fur clotted flat into the crust. */
  readonly mud?: number;
  /** In a matted streak: wet clumps lying short. */
  readonly matted?: number;
  /** On a scar and its parting: the coat parted to the healed skin. */
  readonly scar?: number;
}

/** The kept share of a card rooted at p: the shortest any wear under it allows. */
export function wearKeep(
  w: {
    readonly seed?: number;
    readonly mud?: Mud;
    readonly matted?: Matted;
    readonly scars?: readonly Scar[];
  },
  o: CardKeep,
): (p: Vec3) => number {
  const salt = w.seed ?? 1;
  return (p) => {
    let k = 1;
    if (w.mud && o.mud !== undefined) {
      // Caked only: flecks thrown up the flank shortened scattered cards into dark stubs.
      k = Math.min(k, 1 - (1 - o.mud) * mudAt(w.mud, p, salt, false).caked);
    }
    if (w.matted && o.matted !== undefined)
      k = Math.min(k, 1 - (1 - o.matted) * mattedAt(w.matted, p, salt));
    if (o.scar !== undefined)
      for (const s of w.scars ?? []) {
        const at = scarAt(s, p, salt);
        if (at) k = Math.min(k, 1 - (1 - o.scar) * Math.max(at.core, at.rim));
      }
    return Math.min(1, Math.max(0, k));
  };
}
