// The face busts' tunic: how a bust ends deliberately instead of as a sawn mannequin. The warped
// base brings bare shoulders and chest; outside a neckline drawn from the warped landmarks (a ring
// round the neck's base, a V at the throat) the skin is painted as dyed wool with a
// trim band at the collar and mapped onto the wool strip, so the bust reads as a dressed figure
// at every LOD (paint only: no triangles, nothing to clash at the neck). The
// wool carries wear broad enough to read at hero distance: dust settled on what faces up (the
// shoulders), grime darkening toward the cut, and fold streaks running down from the collar.

import { dmath, type Mesh, type Rng, type Vec3, valueNoise } from '@developerz.ai/ts23d';
import { collarBand, necklineCurve } from './collar.ts';
import type { FaceHead } from './head.ts';
import { LEFT, MIDLINE } from './landmarks.ts';
import { quadToMesh, stripUv } from './quad.ts';

export interface Garment {
  /** The wool's dyed colour (linear). */
  readonly cloth: Vec3;
  /** The collar band's colour (a contrasting braid or leather binding). */
  readonly trim: Vec3;
  /** Dust on the shoulders, 0 … 1 (default 0.5). */
  readonly dust?: number;
  /** How deep the V at the throat is, metres on the base head (default 0.03). */
  readonly vee?: number;
}

/** The collar's middle on the neckline (metres on the base head, down onto the cloth) and its
 *  half-width: it covers the paint's soft edge and the strip split between skin and wool. */
const COLLAR_AT = -0.003;
const COLLAR_W = 0.011;

const clamp = (v: number): number => Math.min(1, Math.max(0, v));
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Distance inside the neckline, metres (> 0 skin, ≤ 0 cloth), in bust space: the collar is a
 *  ring round the neck's base (a cylinder a third wider than the neck, about its axis), opened
 *  into a shallow V at the throat; everything above the throat is skin. */
export function necklineOf(head: FaceHead, g: Garment): (p: Vec3) => number {
  const s = head.scale;
  const nape = head.map(MIDLINE.nape);
  const throat = head.map(MIDLINE.throat);
  const neck = head.map(LEFT.neck);
  const cx = (nape[0] + throat[0]) / 2;
  const rx = (throat[0] - nape[0]) / 2;
  const ry = Math.abs(neck[1]);
  const R = 1.38;
  const vee = (g.vee ?? 0.03) * s;
  const top = throat[2];
  const jug = head.map(MIDLINE.jugular);
  return (p) => {
    const r = dmath.hypot((p[0] - cx) / rx, p[1] / ry);
    // The V: the ring pushed out (and so down the chest) in front, narrowing to the midline.
    const front = Math.max(0, (p[0] - cx) / rx);
    const v = (vee / ry) * front * Math.max(0, 1 - Math.abs(p[1]) / (ry * 0.9));
    // (The back of the neck runs straight down into the upper back, inside the ring: the collar
    // closes under the nape and above the breastbone, lower toward the front.)
    const t = Math.min(1, Math.max(0, (p[0] - nape[0]) / (throat[0] - nape[0])));
    const low = nape[2] - 0.04 * s + (jug[2] - nape[2] + 0.04 * s) * t - v * ry * 0.6;
    return Math.max(Math.min((R + v - r) * ry, p[2] - low), p[2] - top);
  };
}

/** The wool's paint over the skin's: `skin` where the neckline is above, dyed wool below it. */
export function garmentPaint(
  head: FaceHead,
  g: Garment,
  rng: Rng,
): (p: Vec3, n: Vec3, skin: Vec3) => Vec3 {
  const s = head.scale;
  const line = necklineOf(head, g);
  // Fold streaks: noise stretched along the fall (down from the collar), a hand wide.
  const folds = valueNoise(rng.fork('folds'), { scale: 0.03 * s, octaves: 2 });
  const blot = valueNoise(rng.fork('blot'), { scale: 0.06 * s, octaves: 2 });
  const jug = head.map(MIDLINE.jugular);
  const dustK = g.dust ?? 0.5;
  const DUST: Vec3 = [0.62, 0.56, 0.47];
  const GRIME: Vec3 = [g.cloth[0] * 0.45, g.cloth[1] * 0.42, g.cloth[2] * 0.4];
  return (p, n, skin) => {
    const h = line(p);
    if (h > 0.004 * s) return skin;
    let c = g.cloth;
    const f = folds([p[0] * 2.5, p[1] * 2.5, p[2] * 0.35]);
    c = mix(c, f > 0 ? [c[0] * 1.18, c[1] * 1.18, c[2] * 1.18] : GRIME, Math.abs(f) * 0.55);
    // Dust where it settles (shoulder tops), broken by a coarse blot so it is not an even wash.
    const up = clamp(((n[2] ?? 0) - 0.35) / 0.5);
    c = mix(c, DUST, up * dustK * (0.55 + 0.45 * clamp(0.5 + blot(p))));
    // Grime toward the hem (the cut), the cloth a wearer handles least and dirties most.
    c = mix(c, GRIME, clamp((jug[2] - 0.05 * s - p[2]) / (0.08 * s)) * 0.5);
    // Under the collar (geometry, collarOf): a soft band of grime and sweat a hand's width of a
    // finger below its edge, darkest at the edge — broad, so it never steps between vertices.
    const below = h - (COLLAR_AT - COLLAR_W) * s;
    c = mix(c, GRIME, clamp(1 + below / (0.022 * s)) * clamp(1 - below / (0.004 * s)) * 0.65);
    // Sun-faded shoulders: the tops of the seams bleached paler and greyer than the folds.
    const fade =
      clamp(((n[2] ?? 0) - 0.55) / 0.35) * clamp((Math.abs(p[1]) - 0.06 * s) / (0.04 * s));
    const grey = (c[0] + c[1] + c[2]) / 3;
    c = mix(c, [grey * 1.35 + 0.03, grey * 1.3 + 0.03, grey * 1.22 + 0.03], fade * 0.3);
    // A soft edge into the skin (the line's millimetres between vertices).
    return mix(c, skin, clamp(h / (0.004 * s)));
  };
}

/** The cloth mask for the strip split (1 on the wool). */
export function clothMask(head: FaceHead, g: Garment): (p: Vec3) => number {
  const line = necklineOf(head, g);
  return (p) => (line(p) <= 0 ? 1 : 0);
}

/** Samples round the neck and section points of the collar per LOD. */
const COLLAR_SEG = [128, 72, 40] as const;
const COLLAR_SIDES = [8, 6, 5] as const;

/** The collar's sewn corner at the bottom of its V (bust space, before the plinth lift): the
 *  front point of the collar's curve, for the creases (a mitred corner, meant). */
export function collarCorner(head: FaceHead, g: Garment): Vec3 {
  const s = head.scale;
  const nape = head.map(MIDLINE.nape);
  const throat = head.map(MIDLINE.throat);
  const { p } = necklineCurve(
    quadToMesh(head.mesh, () => g.cloth, stripUv('plain')),
    {
      line: necklineOf(head, g),
      centre: COLLAR_AT * s,
      axisX: (nape[0] + throat[0]) / 2,
      segments: COLLAR_SEG[0],
    },
  );
  let best: Vec3 = throat;
  for (const q of p) if (q[0] - Math.abs(q[1]) > best[0] - Math.abs(best[1])) best = q;
  return best;
}

/** The collar as geometry along the neckline on `skin` (bust space, as `garmentPaint` paints
 *  it): the trim colour, darker and lighter in long stretches where it is handled and rubbed. */
export function collarOf(head: FaceHead, g: Garment, skin: Mesh, lod: number): Mesh | undefined {
  const s = head.scale;
  const nape = head.map(MIDLINE.nape);
  const throat = head.map(MIDLINE.throat);
  const T = g.trim;
  return collarBand(skin, {
    line: necklineOf(head, g),
    centre: COLLAR_AT * s,
    axisX: (nape[0] + throat[0]) / 2,
    width: COLLAR_W * s,
    thick: 0.0045 * s,
    segments: COLLAR_SEG[lod] ?? 48,
    sides: COLLAR_SIDES[lod] ?? 6,
    color: (t) => {
      const w = 0.5 + 0.5 * dmath.sin(t * 2 * Math.PI * 5 + 1.3) * dmath.sin(t * 2 * Math.PI * 3);
      const k = 0.78 + 0.34 * w;
      return [T[0] * k, T[1] * k, T[2] * k];
    },
  });
}
