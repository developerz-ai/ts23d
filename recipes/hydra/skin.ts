// Hydra skin as functions of the surface point: muscle and ridges as relief, crocodilian belly scutes,
// bronze-green back crossed by dark saddles, pale gular and belly plates. The scales themselves are
// in the strip (material.ts). Wear tells where it lives and what it has fought: river mud caked up
// the legs and under the belly, a neck raked by claws, a bite on the flank. Deterministic value noise.

import type { ChainSpec, Vec3 } from '@developerz.ai/ts23d';
import { hex } from '@developerz.ai/ts23d';

type Relief = NonNullable<ChainSpec['relief']>;
type Tint = NonNullable<ChainSpec['tint']>;

const fract = (x: number): number => x - Math.floor(x);
const hash3 = (x: number, y: number, z: number): number =>
  fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
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

const bump = (u: number, c: number, w: number): number => Math.exp(-(((u - c) / w) ** 2));

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
  mud: hex('#4a3d2b'),
  dryMud: hex('#8a7a5c'),
  scar: hex('#a68a78'),
  scarDeep: hex('#5c3a32'),
  tongue: hex('#7a3a44'),
} as const;

/** How far round toward the belly a point is: 0 on the back, 1 on the midline below. */
const under = (angle: number): number => (1 - Math.cos(angle)) / 2;

/** Distance to the nearest scute line, as a share of the scute length (0 on the line). */
const fromLine = (s: number, pitch: number): number => {
  const w = fract(s / pitch);
  return Math.min(w, 1 - w);
};

/** Crocodilian transverse scutes: a soft trough across the underside, wide enough to stay a
 *  shape and not a cut (the painted line is what reads as the scute edge). */
const plates = (s: number, pitch: number, q: number): number =>
  -smooth(clamp01(q * 2 - 1)) * Math.exp(-((fromLine(s, pitch) / 0.16) ** 2));

/** River mud, 0..1: caked thick on the feet and shins, splashed up the legs, dusting the belly. */
export function mudAt(p: Vec3, low = 0): number {
  const ragged = 0.75 + 0.5 * noise3(at(p, 7, 9));
  const legs = 1 - smooth(clamp01((p[2] - 0.12 * ragged) / (0.42 * ragged)));
  const belly = smooth(clamp01((low - 0.78) * 5)) * 0.55 * ragged;
  return clamp01(Math.max(legs, belly) * (0.8 + 0.4 * noise3(at(p, 3, 5))));
}

/** Mud over a colour: wet and dark low down, dried pale at its upper edge. */
export function muddy(c: Vec3, p: Vec3, low = 0): Vec3 {
  const m = mudAt(p, low);
  const dried = smooth(clamp01((p[2] - 0.08) / 0.3));
  return lerp(c, lerp(C.mud, C.dryMud, dried * 0.7), m * 0.82);
}

/** Healed claw rakes, 0..1: three parallel diagonal slashes across one neck's flank. */
function rakeAt(s: number, angle: number, radius: number): number {
  const across = (angle > Math.PI ? angle - Math.PI * 2 : angle) * radius;
  let best = 0;
  for (const k of [0, 1, 2]) {
    const d = s - 0.95 - k * 0.1 - across * 0.9;
    const lengthwise = Math.exp(-(((across + 0.05 + k * 0.02) / 0.2) ** 2));
    best = Math.max(best, Math.exp(-((d / 0.024) ** 2)) * lengthwise);
  }
  return best;
}

/** A healed bite on the right flank behind the shoulder: a ring of tooth punctures, 0..1. */
function biteAt(p: Vec3): number {
  const c: Vec3 = [0.12, -0.5, 1.08];
  const d = Math.hypot((p[0] - c[0]) / 1.4, p[1] - c[1], p[2] - c[2]);
  const ring = Math.exp(-(((d - 0.2) / 0.035) ** 2));
  const teeth = 0.5 + 0.5 * Math.cos(Math.atan2(p[2] - c[2], p[0] - c[0]) * 9);
  return p[1] < -0.2 ? ring * (0.35 + 0.65 * teeth) : 0;
}

/** Scarred chain: neck 1 (toward the hero camera) carries the rakes; everything else heals clean. */
const SCARRED_NECK = 1;

function baseColour(p: Vec3, angle: number, s: number, pitch: number, tone: number, lod = 0): Vec3 {
  const low = under(angle);
  // Dark saddles across the back at a regular pitch (as a monitor's bands), edges broken by noise.
  const band = 0.5 + 0.5 * Math.cos((p[0] / 0.62) * Math.PI * 2 + noise3(at(p, 1.2, 4)) * 2.4);
  const saddle = smooth(clamp01((band - 0.42) * 3.2)) * (1 - smooth(clamp01((low - 0.3) * 4)));
  // Far away a few vertices cannot hold blotches: broad back-to-belly colour, saddles averaged.
  if (lod === 2) {
    const far = lerp(
      lerp(
        lerp(C.back, C.flank, 0.3 + tone),
        C.saddle,
        0.32 * (1 - smooth(clamp01((low - 0.3) * 4))),
      ),
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
  const up = Math.max(0, Math.cos(q.angle));
  const flank = Math.abs(Math.sin(q.angle));
  const shoulder = 0.07 * bump(q.u, 0.2, 0.16) * flank;
  const hip = 0.08 * bump(q.u, 0.8, 0.14) * flank;
  const spine = 0.035 * up ** 10;
  const ribs = 0.006 * Math.sin(q.s * 21) * flank ** 2 * bump(q.u, 0.5, 0.26);
  const scute = plates(q.s, 0.17, under(q.angle)) * 0.008;
  return shoulder + hip + spine + ribs + scute - 0.008 * biteAt(q.p);
};

export const bodyTint: Tint = (q) =>
  scarred(baseColour(q.p, q.angle, q.s, 0.17, 0, q.lod), q.lod === 2 ? 0 : biteAt(q.p));

export const tailRelief: Relief = (q) => {
  return (
    0.022 * (1 - q.u) * Math.max(0, Math.cos(q.angle)) ** 8 +
    plates(q.s, 0.13, under(q.angle)) * 0.006 * (1 - q.u)
  );
};

export const tailTint: Tint = (q) => {
  const band = smooth(clamp01(Math.sin(q.s * 7.5) * 1.3 + 0.2));
  const bands = (q.lod === 2 ? 0.3 : band * 0.55) * (1 - under(q.angle));
  return lerp(baseColour(q.p, q.angle, q.s, 0.13, 0, q.lod), C.saddle, bands);
};

/** Necks: a strap of muscle either side of the spine ridge, gular plates in front; one raked. */
export const neckRelief =
  (k: number): Relief =>
  (q) => {
    const up = Math.max(0, Math.cos(q.angle));
    const strap = 0.014 * Math.abs(Math.sin(q.angle)) ** 3 * (1 - q.u * 0.5);
    const rake = k === SCARRED_NECK ? rakeAt(q.s, q.angle, q.radius) : 0;
    return strap + 0.012 * up ** 10 + plates(q.s, 0.11, under(q.angle)) * 0.005 - 0.012 * rake;
  };

export const neckTint =
  (tone: number, k: number): Tint =>
  (q) => {
    const c = baseColour(q.p, q.angle, q.s, 0.11, tone, q.lod);
    return k === SCARRED_NECK && q.lod < 2 ? scarred(c, rakeAt(q.s, q.angle, q.radius)) : c;
  };

/** Legs: deltoid and thigh at the root, knobbed scales lower down. */
export const legRelief: Relief = (q) => {
  return 0.03 * bump(q.u, 0.18, 0.2) + 0.016 * bump(q.u, 0.55, 0.12) * Math.abs(Math.cos(q.angle));
};

export const legTint: Tint = (q) => baseColour(q.p, q.angle + 0.7, q.s, 40, 0.06, q.lod);
