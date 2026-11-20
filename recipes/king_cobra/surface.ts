// King cobra skin. LOD0 carries real scales: a lattice of low diamond plates over the back and flanks
// (15 rows at midbody, each with its own colour, so the bands are crisp at scale size) and ventral
// scutes across the belly and up the hood's front. LOD1 paints the same bands on the tube; LOD2 is
// too coarse to sample a band, so it takes the pattern's average per stretch of body instead.

import { dmath, hex, type Mesh, MeshBuilder, type Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  cross,
  even,
  gauss,
  loft,
  mixRgb,
  noise,
  norm,
  scale,
  smooth,
  stations,
  sub,
} from '../_lib/body-plan-kit.ts';
import {
  dustAt,
  marked,
  pinLoftUv,
  SCALE_STRIP,
  scaleUv,
  scarAt,
  scuffAt,
  shedAt,
} from './material.ts';
import { frameAt, HEAD, halfW, hoodShare, SVL, surfacePoint, TOTAL } from './shape.ts';

export { SCALE_STRIP } from './material.ts';

type Lod = 0 | 1 | 2;

export const COLOUR = {
  olive: hex('#4b4730'),
  dark: hex('#1b1b16'),
  skin: hex('#14130f'),
  band: hex('#d9cf9c'),
  bandEdge: hex('#171612'),
  head: hex('#5c5230'),
  suture: hex('#17140c'),
  throat: hex('#fbf1cf'),
  belly: hex('#ece0b2'),
  bellyDark: hex('#2b2a22'),
  hoodSpot: hex('#15140f'),
  iris: hex('#7a4a22'),
  pupil: hex('#040404'),
  tongue: hex('#1d1a1e'),
  lip: hex('#b7a874'),
} as const;

/** Pale bands: about 40 between head and vent, chevrons pointing at the head (README). */
const BAND_PITCH = SVL / 40;

/** Band strength at (s, a): 1 in the pale band, -1 on its dark edge, 0 between. */
function bandAt(s: number, a: number): number {
  if (s < 0.14) return 0;
  // 0 on the dorsal ridge to 1 low on the flank: one straight arm of the chevron per side, its
  // point on the ridge toward the head, the band widening as it runs down the flank. The arm
  // sweeps back 0.45 of a pitch, so each band stays a crossband of its own; swept a whole
  // pitch (as before) the arms lined up with the next band into a viper's zigzag.
  const w = Math.min(1, sideOf(a) / 1.9);
  const k = (s - 0.45 * BAND_PITCH * w) / BAND_PITCH;
  const d = Math.abs(k - Math.round(k)) * BAND_PITCH;
  const fade = 1 - smooth(TOTAL * 0.62, TOTAL * 0.8, s) * 0.85;
  // Narrow pale bands (one or two scale rows) on a wide olive ground, a thin dark rim only.
  const half = 0.0075 + 0.005 * w;
  if (d < half) return fade;
  return d < half + 0.0035 ? -0.5 * fade : 0;
}

export function dorsalColour(s: number, a: number, seed: number): Vec3 {
  const tailDark = smooth(TOTAL * 0.55, TOTAL * 0.8, s);
  const base = mixRgb(COLOUR.olive, COLOUR.dark, 0.2 + 0.8 * tailDark);
  const tone = 0.82 + 0.36 * noise(seed * 0.73, seed * 0.11, 3);
  const b = bandAt(s, a);
  const c =
    b > 0
      ? mixRgb(base, COLOUR.band, b * (0.7 + 0.3 * noise(seed, 2.5, 5)))
      : b < 0
        ? mixRgb(base, COLOUR.bandEdge, -b)
        : base;
  return scale(c, tone);
}

/** Average of the dorsal pattern over a band pitch at s: what LOD2 shows instead of sampling it. */
export function dorsalAverage(s: number, a: number): Vec3 {
  const n = 12;
  let c: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++)
    c = add(c, dorsalColour(s + ((i + 0.5) / n - 0.5) * BAND_PITCH, a, 1));
  // The scales' dark rims and the interscale skin between them pull the seen colour down by about
  // a third against the scale crowns' own colour (matched by eye to the LOD0 render).
  return scale(c, 0.52 / n / (0.82 + 0.36 * noise(0.73, 0.11, 3)));
}

const ventralAverage = (s: number): Vec3 => {
  let c: Vec3 = [0, 0, 0];
  for (let i = 0; i < 8; i++) c = add(c, ventralColour(s + ((i + 0.5) / 8 - 0.5) * 0.12));
  return scale(c, 1 / 8);
};

/** Belly colour; `across` is -1..1 over a scute, for the dark net at the hood's edges. */
export function ventralColour(s: number, across = 0): Vec3 {
  const throat = 1 - smooth(0.42, 0.9, s);
  // The dark throat band low on the hood's front, as in front photos.
  const collar = Math.max(gauss(s - 0.47, 0.024), 0.7 * gauss(s - 0.58, 0.016));
  const c = mixRgb(
    // Cream under the raised front; greyed under the pile, where only its edge ever shows.
    mixRgb(COLOUR.belly, COLOUR.bellyDark, smooth(0.9, 1.25, s)),
    COLOUR.throat,
    throat,
  );
  const net = gauss(s - 0.22, 0.07) * smooth(0.52, 0.78, Math.abs(across));
  return mixRgb(c, COLOUR.hoodSpot, Math.max(collar * 0.92, net));
}

/** Stations of the hood ribs: even the farthest LOD keeps flesh on each of them. */
export const HOOD_RINGS: readonly number[] = [0.125, 0.17, 0.225, 0.3];

/** The tube under the scales: dark interscale skin at LOD0, painted bands at LOD1, averaged at LOD2. */
export function trunkMesh(lod: Lod, joints: readonly number[]): Mesh {
  const start = HEAD.length * 0.9;
  const us =
    lod === 2
      ? stations([start, ...HOOD_RINGS, ...joints.filter((s) => s > start), TOTAL - 0.004], 0.01)
      : stations(
          [
            // LOD0's tube lies under the scales: rings only where the body curves.
            ...even(start, 0.8, lod === 0 ? 56 : 64),
            ...even(0.8, TOTAL - 0.004, lod === 0 ? 150 : 220),
          ],
          0.002,
        );
  const sides = lod === 0 ? 20 : lod === 1 ? 14 : 6;
  const mesh = loft({
    us,
    sides,
    strip: SCALE_STRIP,
    // Sunk under the scales at LOD0, but never past the axis where the tail tip is thinner than that.
    point: (s, a) => surfacePoint(s, a, lod === 0 ? -Math.min(0.0006, 0.4 * halfW(s)) : 0),
    color: (_p, _n, s, a) => {
      if (lod === 0) return COLOUR.skin;
      if (lod === 2) {
        // Six sides: only the bottom vertex is belly; averaged so no band lands whole, but the
        // dark throat collar stays as a band across the raised neck.
        if (sideOf(a) > 2.5)
          return marked(
            mixRgb(ventralAverage(s), COLOUR.hoodSpot, 0.7 * gauss(s - 0.5, 0.07)),
            s,
            a,
            true,
          );
        // Small story marks would paint a whole segment of a 20 cm ring: only the broad dust stays.
        return marked(dorsalAverage(s, a), s, a, true);
      }
      if (sideOf(a) > 2.04) return ventralColour(s, (Math.PI - sideOf(a)) / 1.1);
      const c = dorsalColour(s, a, 1);
      return marked(scale(c, 1 / (0.82 + 0.36 * noise(0.73, 0.11, 3))), s, a);
    },
  });
  // Interscale skin is matte; the far tube shows the scales' mean sheen.
  return pinLoftUv(mesh, us, sides, (s, a) =>
    lod === 0 ? [0, 0] : sideOf(a) > (lod === 2 ? 2.5 : 2.04) ? [0.55, 0] : [0.72, shedAt(s, a)],
  );
}

/** A low pyramid per scale, corners on the lattice so neighbours share positions. Each corner
 *  carries the pattern's colour at its own point, so band edges run clean across the scales. */
function diamond(
  b: MeshBuilder,
  q: readonly Vec3[],
  peak: Vec3,
  colors: readonly Vec3[],
  crownColor: Vec3,
  dull: number,
): void {
  const [rim, crown] = [scaleUv(0.06, dull), scaleUv(0.92, dull)];
  const n = q.length;
  for (let i = 0; i < n; i++) {
    const [p0, p1] = [q[i] as Vec3, q[(i + 1) % n] as Vec3];
    const [c0, c1] = [colors[i] as Vec3, colors[(i + 1) % n] as Vec3];
    const f = norm(cross(sub(p1, p0), sub(peak, p0)));
    const up = norm(
      sub(peak, scale(add(add(q[0] as Vec3, q[1] as Vec3), add(q[2] as Vec3, q[3] as Vec3)), 0.25)),
    );
    const flip = f[0] * up[0] + f[1] * up[1] + f[2] * up[2] < 0;
    const fn = flip ? scale(f, -1) : f;
    const shade = norm(add(scale(fn, 0.55), scale(up, 0.45)));
    const [a, c] = flip ? [p1, p0] : [p0, p1];
    const [ca, cc] = flip ? [c1, c0] : [c0, c1];
    const i0 = b.vertex({ p: a, n: shade, uv: rim, color: ca });
    const i1 = b.vertex({ p: c, n: shade, uv: rim, color: cc });
    const i2 = b.vertex({ p: peak, n: up, uv: crown, color: scale(crownColor, 1.14) });
    b.tri(i0, i1, i2);
  }
}

const ROW_LENGTH = 0.0165;
const DORSAL_ROWS = 15;
/** Half-angle of the section the dorsal scales cover; the scutes take the rest. */
const COVER = 2.28;

/** Back and flank scales: one connected diamond lattice from nape to tail tip. */
export function scaleSheet(): Mesh {
  const b = new MeshBuilder();
  const start = HEAD.length + 0.012;
  const rows = Math.floor((TOTAL - 0.05 - start) / (ROW_LENGTH / 2));
  const across = DORSAL_ROWS;
  const point = (i: number, j: number, lift: number): Vec3 => {
    const s = start + (i * ROW_LENGTH) / 2;
    return surfacePoint(s, (j / across) * COVER, lift);
  };
  for (let i = 0; i < rows; i++)
    for (let j = -across; j < across; j++) {
      if ((i + j) % 2 !== 0) continue;
      const s = start + ((i + 1) * ROW_LENGTH) / 2;
      const a = ((j + 0.5) / across) * COVER;
      const fade = 1 - smooth(TOTAL - 0.45, TOTAL - 0.05, s) * 0.55;
      // Scar tissue heals flat and slightly sunken; lifted pre-shed skin stands a hair proud.
      const scar = scarAt(s, a);
      const shed = shedAt(s, a);
      const dull = Math.max(shed, dustAt(s, a));
      const raise = 0.0013 * fade * (1 - 0.85 * scar) + 0.0003 * shed - 0.0006 * scar;
      const q = [
        point(i, j, -0.0003),
        point(i, j + 1, -0.0003),
        point(i + 2, j + 1, -0.0003),
        point(i + 2, j, -0.0003),
      ];
      // Diamond corners: mid-points of the lattice cell's edges, overlapping toward the tail.
      const mid = (u: Vec3, v: Vec3): Vec3 => scale(add(u, v), 0.5);
      const d = [
        mid(q[0] as Vec3, q[1] as Vec3),
        mid(q[1] as Vec3, q[2] as Vec3),
        mid(q[2] as Vec3, q[3] as Vec3),
        mid(q[3] as Vec3, q[0] as Vec3),
      ];
      // Corner (row, column) on the lattice, in half rows and columns from this cell's origin.
      const seed = i * 37 + j * 11;
      const at = (di: number, dj: number): Vec3 => {
        const [cs, ca] = [start + ((i + di) * ROW_LENGTH) / 2, ((j + dj) / across) * COVER];
        return marked(dorsalColour(cs, ca, seed), cs, ca);
      };
      diamond(
        b,
        d,
        surfacePoint(s + ROW_LENGTH * 0.12, a, raise),
        [at(0, 0.5), at(1, 1), at(2, 0.5), at(1, 0)],
        marked(dorsalColour(s, a, seed), s, a),
        dull,
      );
    }
  return b.build();
}

/** Ventral scutes: broad plates, one per ventral count, across the belly and the hood's front. */
export function scutes(): Mesh {
  const b = new MeshBuilder();
  const count = 241;
  const pitch = SVL / count;
  const segs = 8;
  for (let i = 0; i < count + 62; i++) {
    const s0 = 0.062 + pitch * (Math.min(i, count) + Math.max(0, i - count) * 1.25);
    if (s0 > TOTAL - 0.06) break;
    const s1 = s0 + pitch * 1.08;
    const reach = 0.86 + 0.5 * hoodShare(s0);
    const tone = 0.93 + 0.1 * noise(i * 0.7, 3.1, 8);
    const at = (s: number, k: number, lift: number): Vec3 =>
      surfacePoint(s, Math.PI + (k / segs - 0.5) * 2 * reach, lift);
    for (let k = 0; k < segs; k++) {
      // Each plate rises toward its free rear edge, whose shadow line separates the scutes.
      const q = [
        at(s0, k, -0.0002),
        at(s0, k + 1, -0.0002),
        at(s1, k + 1, 0.0012),
        at(s1, k, 0.0012),
      ];
      const n0 = norm(cross(sub(q[1] as Vec3, q[0] as Vec3), sub(q[3] as Vec3, q[0] as Vec3)));
      const f = frameAt(s0);
      const c = sub(q[0] as Vec3, f.p);
      const outward = dot3(n0, c) >= 0;
      const n = outward ? n0 : scale(n0, -1);
      const across = (2 * (k + 0.5)) / segs - 1;
      // Tail scutes dragged over rock are scuffed matte and greyed at the free edge.
      const scuff = scuffAt(s0, k);
      const a = Math.PI + ((k + 0.5) / segs - 0.5) * 2 * reach;
      const color = marked(
        mixRgb(scale(ventralColour(s0, across), tone), [0.3, 0.29, 0.26], scuff * 0.5),
        s0,
        a,
        true,
      );
      const ids = q.map((p, v) =>
        b.vertex({
          p,
          n,
          uv: scaleUv(v < 2 ? 0.2 : 0.62 - 0.5 * scuff),
          color: v < 2 ? scale(color, 0.42) : color,
        }),
      );
      const [i0, i1, i2, i3] = [ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0];
      if (outward) b.quad(i0, i1, i2, i3);
      else b.quad(i0, i3, i2, i1);
    }
  }
  return b.build();
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const sideOf = (a: number): number => Math.abs(dmath.atan2(dmath.sin(a), dmath.cos(a)));
