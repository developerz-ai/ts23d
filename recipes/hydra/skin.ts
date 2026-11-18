// Hydra skin as functions of the surface point: muscle and ridges as relief, crocodilian belly scutes,
// bronze-green back with darker saddles, pale gular and belly plates. Deterministic value noise.

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

const at = (p: Vec3, k: number, s = 0): Vec3 => [p[0] * k + s, p[1] * k - s, p[2] * k + s / 2];

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
} as const;

interface Scale {
  /** 0 at a scale's edge, 1 on its crown. */
  readonly crown: number;
  /** 1 in the groove between scales. */
  readonly groove: number;
}

/** Overlapping rows of hexagonal scales on the unrolled skin (arc along, radius × angle across). */
export function scaleAt(s: number, across: number, size: number): Scale {
  const h = size * 0.866;
  const row = Math.round(across / h);
  let best = Number.POSITIVE_INFINITY;
  for (let j = row - 1; j <= row + 1; j++) {
    const shift = j % 2 === 0 ? 0 : 0.5;
    const i = Math.round(s / size - shift);
    best = Math.min(best, Math.hypot(s - (i + shift) * size, across - j * h));
  }
  const d = best / size;
  // A cosine crown: it meets the next scale with a level tangent, a valley and not a cut.
  const crown = 0.5 + 0.5 * Math.cos(Math.PI * clamp01(d / 0.58));
  return { crown, groove: smooth(clamp01((d - 0.42) / 0.14)) };
}

const sizeOn = (r: number, low: number): number => (0.028 + r * 0.095) * (1 - low * 0.35);

/** Scale height as a share of its size: shallow enough that the valleys stay rounded. */
const SCALE_RISE = 0.09;

/** Scale relief for a surface point: graded by section radius, none on the belly plates, and
 *  faded out where the section is too thin to carry a scale (the tail tip). */
const scaleLift = (q: { s: number; angle: number; radius: number }): number => {
  const low = under(q.angle);
  const size = sizeOn(q.radius, low);
  const room = smooth(clamp01((q.radius - 0.03) / 0.07));
  const bare = 1 - smooth(clamp01((low - 0.6) * 4));
  return scaleAt(q.s, q.angle * q.radius, size).crown * size * SCALE_RISE * room * bare;
};

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

function baseColour(
  p: Vec3,
  angle: number,
  s: number,
  pitch: number,
  tone: number,
  radius = 0.3,
  lod = 0,
): Vec3 {
  const low = under(angle);
  // Far away a few vertices cannot hold blotches: broad back-to-belly colour only.
  if (lod === 2) {
    const far = lerp(
      lerp(C.back, C.flank, 0.3 + tone),
      C.ochre,
      smooth(clamp01((low - 0.42) * 3.2)),
    );
    return lerp(far, C.belly, smooth(clamp01((low - 0.68) * 4)));
  }
  const saddle = smooth(clamp01((noise3(at(p, 1.5, 4)) - 0.46) * 5));
  const dapple = noise3(at(p, 9, 2));
  const top = lerp(lerp(C.back, C.flank, dapple * 0.8 + tone), C.saddle, saddle * 0.75);
  const side = lerp(top, C.ochre, smooth(clamp01((low - 0.42) * 3.2)));
  const belly = lerp(side, C.belly, smooth(clamp01((low - 0.68) * 4)));
  const groove = low > 0.5 && fromLine(s, pitch) < 0.09 ? 0.55 : 0;
  const plated = lerp(belly, C.plateLine, groove);
  // Scale crowns catch light, the grooves between them hold shadow; none on the belly plates.
  const cell = scaleAt(s, angle * radius, sizeOn(radius, low));
  const k = (1 - smooth(clamp01((low - 0.6) * 4))) * 0.55;
  return lerp(lerp(plated, C.saddle, cell.groove * k), C.flank, cell.crown * k * 0.25);
}

/** Trunk: shoulder and hip masses, the spine ridge, ribs along the flank, belly plates. */
export const bodyRelief: Relief = (q) => {
  const up = Math.max(0, Math.cos(q.angle));
  const flank = Math.abs(Math.sin(q.angle));
  const shoulder = 0.07 * bump(q.u, 0.2, 0.16) * flank;
  const hip = 0.08 * bump(q.u, 0.8, 0.14) * flank;
  const spine = 0.035 * up ** 10;
  const ribs = 0.006 * Math.sin(q.s * 21) * flank ** 2 * bump(q.u, 0.5, 0.26);
  const scute = plates(q.s, 0.17, under(q.angle)) * 0.008;
  return shoulder + hip + spine + ribs + scute + scaleLift(q);
};

export const bodyTint: Tint = (q) => baseColour(q.p, q.angle, q.s, 0.17, 0, q.radius, q.lod);

export const tailRelief: Relief = (q) => {
  return (
    0.022 * (1 - q.u) * Math.max(0, Math.cos(q.angle)) ** 8 +
    plates(q.s, 0.13, under(q.angle)) * 0.006 * (1 - q.u) +
    scaleLift(q)
  );
};

export const tailTint: Tint = (q) => {
  const band = smooth(clamp01(Math.sin(q.s * 7.5) * 1.3 + 0.2));
  const bands = q.lod === 2 ? 0 : band * 0.42 * (1 - under(q.angle));
  return lerp(baseColour(q.p, q.angle, q.s, 0.13, 0, q.radius, q.lod), C.saddle, bands);
};

/** Necks: a strap of muscle either side of the spine ridge, gular plates in front. */
export const neckRelief: Relief = (q) => {
  const up = Math.max(0, Math.cos(q.angle));
  const strap = 0.014 * Math.abs(Math.sin(q.angle)) ** 3 * (1 - q.u * 0.5);
  return strap + 0.012 * up ** 10 + plates(q.s, 0.11, under(q.angle)) * 0.005 + scaleLift(q);
};

export const neckTint =
  (tone: number): Tint =>
  (q) =>
    baseColour(q.p, q.angle, q.s, 0.11, tone, q.radius, q.lod);

/** Legs: deltoid and thigh at the root, knobbed scales lower down. */
export const legRelief: Relief = (q) => {
  return (
    0.03 * bump(q.u, 0.18, 0.2) +
    0.016 * bump(q.u, 0.55, 0.12) * Math.abs(Math.cos(q.angle)) +
    scaleLift(q)
  );
};

export const legTint: Tint = (q) => baseColour(q.p, q.angle + 0.7, q.s, 40, 0.06, q.radius, q.lod);
