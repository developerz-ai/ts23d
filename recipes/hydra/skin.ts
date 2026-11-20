// Hydra skin as functions of the surface point: muscle and ridges as relief, crocodilian belly scutes,
// bronze-green back crossed by dark saddles, pale gular and belly plates. The scales themselves are
// in the strip (material.ts). Wear tells where it lives and what it has fought: river mud caked up
// the legs and under the belly, a neck raked by claws, a bite on the flank. Deterministic value noise.

import type { ChainSpec, Vec3 } from '@developerz.ai/ts23d';
import { dmath, hex } from '@developerz.ai/ts23d';

type Relief = NonNullable<ChainSpec['relief']>;
type Tint = NonNullable<ChainSpec['tint']>;

const fract = (x: number): number => x - Math.floor(x);
const hash3 = (x: number, y: number, z: number): number =>
  fract(dmath.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

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

export const at = (p: Vec3, k: number, s = 0): Vec3 => [
  p[0] * k + s,
  p[1] * k - s,
  p[2] * k + s / 2,
];

export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

const bump = (u: number, c: number, w: number): number => dmath.exp(-dmath.pow((u - c) / w, 2));

export const C = {
  back: hex('#566044'),
  saddle: hex('#2d3527'),
  flank: hex('#7c7a50'),
  ochre: hex('#a48e58'),
  belly: hex('#d8c894'),
  plateLine: hex('#8d7a50'),
  horn: hex('#2a241c'),
  hornMid: hex('#6e6048'),
  hornTip: hex('#d8cdb0'),
  claw: hex('#1c1712'),
  tooth: hex('#e9e2c8'),
  gum: hex('#6e2f2c'),
  mouth: hex('#3a1517'),
  spine: hex('#2c2a20'),
  iris: hex('#d3a02c'),
  mud: hex('#33261a'),
  dryMud: hex('#b9ae98'),
  scar: hex('#a68a78'),
  scarDeep: hex('#5c3a32'),
  tongue: hex('#7a3a44'),
} as const;

/** How far round toward the belly a point is: 0 on the back, 1 on the midline below. */
const under = (angle: number): number => (1 - dmath.cos(angle)) / 2;

/** Distance to the nearest scute line, as a share of the scute length (0 on the line). */
const fromLine = (s: number, pitch: number): number => {
  const w = fract(s / pitch);
  return Math.min(w, 1 - w);
};

/** Crocodilian transverse scutes: a soft trough across the underside, wide enough to stay a
 *  shape and not a cut (the painted line is what reads as the scute edge). */
const plates = (s: number, pitch: number, q: number): number =>
  -smooth(clamp01(q * 2 - 1)) * dmath.exp(-dmath.pow(fromLine(s, pitch) / 0.16, 2));

/** River mud, 0..1: caked thick on the feet and shins up to the knee, splashed in a broad band
 *  under the belly and chest where it drags through the shallows. Big ragged shapes, so it reads
 *  from the hero camera, not a speckle. */
export function mudAt(p: Vec3, low = 0): number {
  const ragged = 0.75 + 0.5 * noise3(at(p, 4, 9));
  const legs = 1 - smooth(clamp01((p[2] - 0.3 * ragged) / (0.32 * ragged)));
  const belly = smooth(clamp01((low - 0.62) * 4)) * (0.55 + 0.45 * ragged);
  return clamp01(Math.max(legs, belly) * (0.85 + 0.3 * noise3(at(p, 2, 5))));
}

/** Mud over a colour: wet and dark low down, dried pale at its upper edge. */
export function muddy(c: Vec3, p: Vec3, low = 0): Vec3 {
  const m = mudAt(p, low);
  const dried = smooth(clamp01((p[2] - 0.16) / 0.22));
  return lerp(c, lerp(C.mud, C.dryMud, dried), m * 0.95);
}

/** Healed claw rakes, 0..1: three parallel diagonal slashes across one neck's flank. */
function rakeAt(s: number, angle: number, radius: number): number {
  const across = (angle > Math.PI ? angle - Math.PI * 2 : angle) * radius;
  let best = 0;
  for (const k of [0, 1, 2]) {
    const d = s - 0.95 - k * 0.14 - across * 0.9;
    const lengthwise = dmath.exp(-dmath.pow((across + 0.05 + k * 0.02) / 0.24, 2));
    best = Math.max(best, dmath.exp(-dmath.pow(d / 0.038, 2)) * lengthwise);
  }
  return best;
}

/** A healed bite on the right flank behind the shoulder: a ring of tooth punctures, 0..1. */
function biteAt(p: Vec3): number {
  const c: Vec3 = [0.12, -0.5, 1.08];
  const d = dmath.hypot((p[0] - c[0]) / 1.4, p[1] - c[1], p[2] - c[2]);
  const ring = dmath.exp(-dmath.pow((d - 0.22) / 0.05, 2));
  const teeth = 0.5 + 0.5 * dmath.cos(dmath.atan2(p[2] - c[2], p[0] - c[0]) * 9);
  return p[1] < -0.2 ? ring * (0.35 + 0.65 * teeth) : 0;
}

/** Scarred chain: neck 1 (toward the hero camera) carries the rakes; everything else heals clean. */
const SCARRED_NECK = 1;

function baseColour(p: Vec3, angle: number, s: number, pitch: number, tone: number, lod = 0): Vec3 {
  const low = under(angle);
  // Dark saddles across the back at a regular pitch (as a monitor's bands), edges broken by noise.
  const band = 0.5 + 0.5 * dmath.cos((p[0] / 0.62) * Math.PI * 2 + noise3(at(p, 1.2, 4)) * 2.4);
  const saddle = smooth(clamp01((band - 0.42) * 3.2)) * (1 - smooth(clamp01((low - 0.3) * 4)));
  // Far away a few vertices cannot hold blotches: broad back-to-belly colour, and the saddles as
  // clean bands (their 0.62 m pitch is several far rings long, so they survive without noise).
  if (lod === 2) {
    const clean = 0.5 + 0.5 * dmath.cos((p[0] / 0.62) * Math.PI * 2);
    const farSaddle = smooth(clamp01((clean - 0.4) * 2.5)) * (1 - smooth(clamp01((low - 0.3) * 4)));
    const far = lerp(
      lerp(lerp(C.back, C.flank, 0.3 + tone), C.saddle, 0.75 * farSaddle),
      C.ochre,
      smooth(clamp01((low - 0.42) * 3.2)),
    );
    return muddy(lerp(far, C.belly, smooth(clamp01((low - 0.68) * 4))), p, low);
  }
  const dapple = noise3(at(p, 9, 2));
  const top = lerp(lerp(C.back, C.flank, dapple * 0.8 + tone), C.saddle, saddle * 0.85);
  const side = lerp(top, C.ochre, smooth(clamp01((low - 0.42) * 3.2)));
  const belly = lerp(side, C.belly, smooth(clamp01((low - 0.68) * 4)));
  const groove = low > 0.5 && fromLine(s, pitch) < 0.09 ? 0.55 : 0;
  return muddy(lerp(belly, C.plateLine, groove), p, low);
}

/** Scar tissue over a colour: pale raised edges round a darker healed line. */
const scarred = (c: Vec3, k: number): Vec3 =>
  lerp(lerp(c, C.scar, Math.min(1, k * 1.6)), C.scarDeep, Math.max(0, k - 0.6) * 1.4);

/** Trunk: shoulder and hip masses, the spine ridge, ribs along the flank, belly plates. */
export const bodyRelief: Relief = (q) => {
  const up = Math.max(0, dmath.cos(q.angle));
  const flank = Math.abs(dmath.sin(q.angle));
  // A barrel, not a box: the ribcage swells widest mid-trunk and rounds into shoulder and hip,
  // which stay only as soft masses.
  const barrel = 0.3 * bump(q.u, 0.48, 0.2) * dmath.pow(flank, 1.5);
  const shoulder = 0.03 * bump(q.u, 0.2, 0.14) * flank;
  const hip = 0.035 * bump(q.u, 0.8, 0.12) * flank;
  const spine = 0.035 * dmath.pow(up, 10);
  const ribs = 0.006 * dmath.sin(q.s * 21) * (flank * flank) * bump(q.u, 0.5, 0.26);
  const scute = plates(q.s, 0.17, under(q.angle)) * 0.008;
  return barrel + shoulder + hip + spine + ribs + scute - 0.008 * biteAt(q.p);
};

export const bodyTint: Tint = (q) =>
  scarred(baseColour(q.p, q.angle, q.s, 0.17, 0, q.lod), q.lod === 2 ? 0 : biteAt(q.p));

export const tailRelief: Relief = (q) => {
  return (
    0.022 * (1 - q.u) * dmath.pow(Math.max(0, dmath.cos(q.angle)), 8) +
    plates(q.s, 0.13, under(q.angle)) * 0.006 * (1 - q.u)
  );
};

export const tailTint: Tint = (q) => {
  const band = smooth(clamp01(dmath.sin(q.s * 7.5) * 1.3 + 0.2));
  const bands = (q.lod === 2 ? 0.3 : band * 0.55) * (1 - under(q.angle));
  return lerp(baseColour(q.p, q.angle, q.s, 0.13, 0, q.lod), C.saddle, bands);
};

/** Necks: a strap of muscle either side of the spine ridge, gular plates in front; one raked. */
export const neckRelief =
  (k: number): Relief =>
  (q) => {
    const up = Math.max(0, dmath.cos(q.angle));
    const strap = 0.014 * dmath.pow(Math.abs(dmath.sin(q.angle)), 3) * (1 - q.u * 0.5);
    const rake = k === SCARRED_NECK ? rakeAt(q.s, q.angle, q.radius) : 0;
    return (
      strap + 0.012 * dmath.pow(up, 10) + plates(q.s, 0.11, under(q.angle)) * 0.005 - 0.012 * rake
    );
  };

export const neckTint =
  (tone: number, k: number): Tint =>
  (q) => {
    const c = baseColour(q.p, q.angle, q.s, 0.11, tone, q.lod);
    return k === SCARRED_NECK && q.lod < 2 ? scarred(c, rakeAt(q.s, q.angle, q.radius)) : c;
  };

/** Legs: deltoid and thigh at the root, knobbed scales lower down. */
export const legRelief: Relief = (q) => {
  return 0.03 * bump(q.u, 0.18, 0.2) + 0.016 * bump(q.u, 0.55, 0.12) * Math.abs(dmath.cos(q.angle));
};

export const legTint: Tint = (q) => baseColour(q.p, q.angle + 0.7, q.s, 40, 0.06, q.lod);
