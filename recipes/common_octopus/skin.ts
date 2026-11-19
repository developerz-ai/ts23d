// Octopus skin as functions of the surface point: soft warts, papillae and transverse folds as
// relief, the mottled red-brown of a resting animal as colour, paler on the oral side of the arms
// and going thin, pale and translucent toward the tips. Wear: a few healed scars (pale, puckered)
// and a regrowing arm tip. Value noise from a hash, so it is deterministic and needs no stream.
// Colours are design values, chosen against the linked photos; the species changes them at will.

import type { ChainSpec, Vec3 } from '@developerz.ai/ts23d';
import { hex } from '@developerz.ai/ts23d';

type Relief = NonNullable<ChainSpec['relief']>;
type Tint = NonNullable<ChainSpec['tint']>;
type Q = Parameters<Relief>[0];

const fract = (x: number): number => x - Math.floor(x);
const hash3 = (x: number, y: number, z: number): number =>
  fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise, 0..1, at a point in cells. */
export function noise3(p: Vec3): number {
  const [ix, iy, iz] = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
  const [fx, fy, fz] = [smooth(p[0] - ix), smooth(p[1] - iy), smooth(p[2] - iz)];
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (i: number, j: number, k: number): number => hash3(ix + i, iy + j, iz + k);
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), fx), mix(c(0, 1, 0), c(1, 1, 0), fx), fy),
    mix(mix(c(0, 0, 1), c(1, 0, 1), fx), mix(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz,
  );
}

const scaled = (p: Vec3, k: number, shift = 0): Vec3 => [
  p[0] * k + shift,
  p[1] * k - shift,
  p[2] * k + shift * 0.5,
];

/** Rounded bumps in cells of `k` per metre: only the tops of the noise rise. */
const warts = (p: Vec3, k: number, floor: number): number =>
  Math.max(0, noise3(scaled(p, k)) - floor) / (1 - floor);

const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

const DEEP = hex('#4c2820');
const RUST = hex('#8a4e36');
const INK = hex('#2e1712');
const SAND = hex('#c49a78');
const PALE = hex('#e6cfba');
const ROSE = hex('#d9a593');

/** Mottling shared by every chain: broad patches, finer flecks, pale spots on the warts. Far away
 *  (LOD2) only the broad patches: flecks sampled on a coarse ring paint whole faces. */
function mottle(p: Vec3, far = false): Vec3 {
  const broad = noise3(scaled(p, 13, 3.1));
  if (far) return lerp(DEEP, RUST, 0.25 + 0.5 * smooth(Math.min(1, broad * 1.35)));
  const fine = noise3(scaled(p, 46, 7.7));
  const fleck = noise3(scaled(p, 120, 1.3));
  const base = lerp(DEEP, RUST, smooth(Math.min(1, broad * 1.35)));
  const warm = lerp(base, SAND, Math.max(0, fine - 0.6) * 1.5);
  return lerp(warm, INK, Math.max(0, fleck - 0.58) * 1.7);
}

const SCAR = hex('#d8b4a4');

/** The mantle flank toward the hero camera, where two healed slashes run (a moray's teeth). */
const SCAR_SIDE: Vec3 = [0.19, -0.97, 0.15];

/**
 * Healed scars, 0..1: two parallel diagonal slashes on the mantle's camera-side flank, and a
 * ragged pale band across the aboral face of two arms (a crab's claw). Pale, slightly puckered.
 */
export function scarAt(q: Q): number {
  if (q.chain === 'mantle') {
    const face = q.n[0] * SCAR_SIDE[0] + q.n[1] * SCAR_SIDE[1] + q.n[2] * SCAR_SIDE[2];
    const patch = Math.max(0, Math.min(1, (face - 0.35) / 0.25));
    const w = q.n[2] - 0.15;
    const slash = (k: number): number => Math.exp(-(((q.u - 0.42 - k - 0.5 * w) / 0.026) ** 2));
    return patch * Math.max(slash(0), 0.8 * slash(0.07));
  }
  if (q.chain === 'arm_1' || q.chain === 'arm_4') {
    const aboral = Math.max(0, Math.cos(q.angle));
    const at = q.chain === 'arm_1' ? 0.34 : 0.27;
    const ragged = 0.012 * Math.sin(q.angle * 5 + q.u * 40);
    return aboral ** 0.5 * Math.exp(-(((q.u - at + ragged) / 0.02) ** 2));
  }
  return 0;
}

export const mantleTint: Tint = (q) => {
  if (q.lod === 2) return mottle(q.p, true);
  const c = mottle(q.p);
  // Warts in skin colour with only a slight lift, not pale studs.
  const warty = lerp(c, SAND, Math.max(0, warts(q.p, 62, 0.62) - 0.2) * 0.3);
  return lerp(warty, SCAR, scarAt(q) * 0.95);
};

/** A papilla takes the skin colour under it, a shade lighter: raised skin, not a stud. */
export const papillaColour = (p: Vec3): Vec3 => {
  const c = mottle(p);
  return lerp([c[0] * 1.1, c[1] * 1.1, c[2] * 1.1], SAND, 0.04);
};

/** Mantle: soft lobes, warts, and folds running round it near the opening. */
export const mantleRelief: Relief = (q) => {
  const lobes = (noise3(scaled(q.p, 11, 5)) - 0.5) * 0.012;
  const wart = warts(q.p, 62, 0.6) * 0.0048 + warts(q.p, 150, 0.68) * 0.0014;
  // The mantle opening: a fold on the ventral side only; dorsally the head runs into the mantle.
  const ventral = Math.max(0, -0.83 * q.n[0] - 0.56 * q.n[2]);
  const collar = Math.max(0, 1 - Math.abs(q.u - 0.88) / 0.12);
  const opening = -0.004 * smooth(collar) * ventral;
  return lobes + wart + opening;
};

/** Head: warts, plus the turret each eye sits in (angle ±90 degrees is the side of the head). */
export const headRelief: Relief = (q: Q) => {
  const side = Math.abs(Math.sin(q.angle)) ** 8;
  const turret = 0.014 * side * Math.exp(-(((q.u - 0.45) / 0.26) ** 2));
  // Concentric skin folds round each eye turret, a few millimetres apart.
  const across = Math.abs((((q.angle % Math.PI) + Math.PI) % Math.PI) - Math.PI / 2) * q.radius;
  const d = Math.hypot(across, (q.u - 0.45) * 0.07);
  const folds = 0.0012 * Math.sin(d * 650) * Math.exp(-(((d - 0.032) / 0.012) ** 2));
  return turret + folds + warts(q.p, 70, 0.62) * 0.003 + (noise3(scaled(q.p, 18, 2)) - 0.5) * 0.004;
};

/** Arms: transverse skin folds and warts on the aboral side, smooth on the sucker side. */
export const armRelief: Relief = (q) => {
  const aboral = Math.max(0, Math.cos(q.angle));
  // Folds every 1.5 to 2 cm, wandering, where the arm bends; fine rings between them.
  const folds = Math.max(0, Math.sin(q.s * 360 + noise3(scaled(q.p, 30, 4)) * 4)) ** 3 * 0.003;
  const rings = Math.sin(q.s * 260) * 0.0005;
  const wart = warts(q.p, 95, 0.6) * 0.0036;
  // No folds in the fillets round the crown, where the arms blend into the head and the web.
  const clear = smooth(Math.min(1, Math.max(0, (q.u - 0.06) / 0.1)));
  return (folds * clear + rings + wart) * (1 - q.u * 0.75) * aboral - 0.0015 * scarAt(q);
};

/** Thin tips let light through: pale, rosy, translucent-looking toward the end of every arm. */
const TIP = hex('#efc7b8');

export const armTint: Tint = (q, base) => {
  const aboral = (Math.cos(q.angle) + 1) / 2;
  const top = lerp(mottle(q.p, q.lod === 2), SAND, Math.max(0, warts(q.p, 95, 0.62) - 0.25) * 0.35);
  const under = lerp(ROSE, PALE, 0.35 + q.u * 0.4);
  const c = lerp(under, top, smooth(Math.min(1, aboral * 1.5)));
  const tipped = lerp(c, TIP, smooth(Math.min(1, Math.max(0, (q.u - 0.72) / 0.28))) * 0.7);
  const scarred = q.lod === 2 ? tipped : lerp(tipped, SCAR, scarAt(q) * 0.8);
  return lerp(scarred, base, 0.04);
};

/** The regrowing arm: its own tint past the break, a pale smooth bud with a scar ring at the join. */
export const regenTint =
  (from: number): Tint =>
  (q, base) => {
    const c = armTint(q, base);
    if (q.u < from - 0.02) return c;
    const bud = lerp(PALE, TIP, 0.3);
    // A dark healed ring at the break, then the pale smooth regrowth.
    const join = Math.exp(-(((q.u - from) / 0.014) ** 2));
    const grown = lerp(c, bud, smooth(Math.min(1, Math.max(0, (q.u - from - 0.01) / 0.03))));
    return lerp(grown, INK, join * 0.8);
  };

export const SUCKER_RIM = hex('#ecd4c4');
export const SUCKER_CUP = hex('#b5796a');
export const WEB_TOP = hex('#7a4834');
export const PAPILLA = hex('#a56f52');
