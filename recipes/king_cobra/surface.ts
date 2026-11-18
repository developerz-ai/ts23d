// King cobra skin. LOD0 carries real scales: a lattice of low diamond plates over the back and flanks
// (15 rows at midbody, each with its own colour, so the bands are crisp at scale size) and ventral
// scutes across the belly and up the hood's front. Lower LODs paint the same pattern on the tube.

import {
  defineMaterial,
  hex,
  type Mesh,
  MeshBuilder,
  stripRect,
  type Vec3,
} from '@developerz.ai/ts23d';
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
import { frameAt, HEAD, hoodShare, SVL, surfacePoint, TOTAL } from './shape.ts';

type Lod = 0 | 1 | 2;

export const SCALE_STRIP = defineMaterial({
  id: 'cobra_scale',
  kind: 'noise',
  scaleMetres: 0.2,
  roughness: 0.34,
  albedo: '#efefef',
  params: { tone: 0.97, mottle: 0.02, relief: 0.00006 },
  description: 'Smooth, faintly glossy snake scale (vertex colour tints).',
});

export const COLOUR = {
  olive: hex('#3f3d29'),
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
  const lateral = Math.abs(Math.sin(a));
  const k = (s - 0.03 * lateral * 2.2) / BAND_PITCH;
  const d = Math.abs(k - Math.round(k)) * BAND_PITCH;
  const fade = 1 - smooth(TOTAL * 0.62, TOTAL * 0.8, s) * 0.85;
  if (d < 0.0125) return fade;
  return d < 0.0205 ? -fade : 0;
}

export function dorsalColour(s: number, a: number, seed: number): Vec3 {
  const tailDark = smooth(TOTAL * 0.55, TOTAL * 0.8, s);
  const base = mixRgb(COLOUR.olive, COLOUR.dark, 0.3 + 0.7 * tailDark);
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

/** Belly colour; `across` is -1..1 over a scute, for the dark net at the hood's edges. */
export function ventralColour(s: number, across = 0): Vec3 {
  const throat = 1 - smooth(0.42, 0.9, s);
  // The dark throat band low on the hood's front, as in front photos.
  const collar = Math.max(gauss(s - 0.47, 0.024), 0.7 * gauss(s - 0.58, 0.016));
  const c = mixRgb(
    mixRgb(COLOUR.belly, COLOUR.bellyDark, smooth(TOTAL * 0.45, TOTAL * 0.8, s)),
    COLOUR.throat,
    throat,
  );
  const net = gauss(s - 0.22, 0.07) * smooth(0.52, 0.78, Math.abs(across));
  return mixRgb(c, COLOUR.hoodSpot, Math.max(collar * 0.92, net));
}

/** Stations of the hood ribs: even the farthest LOD keeps flesh on each of them. */
export const HOOD_RINGS: readonly number[] = [0.125, 0.17, 0.225, 0.3];

/** The tube under the scales: dark interscale skin at LOD0, painted bands at lower LODs. */
export function trunkMesh(lod: Lod, joints: readonly number[]): Mesh {
  const start = HEAD.length * 0.9;
  const us =
    lod === 2
      ? stations([start, ...HOOD_RINGS, ...joints.filter((s) => s > start), TOTAL - 0.004], 0.01)
      : stations(
          [
            ...even(start, 0.8, lod === 0 ? 70 : 34),
            ...even(0.8, TOTAL - 0.004, lod === 0 ? 210 : 72),
          ],
          0.002,
        );
  return loft({
    us,
    sides: lod === 0 ? 20 : lod === 1 ? 12 : 6,
    strip: SCALE_STRIP,
    metres: [TOTAL, 0.16],
    stripHeight: 0.2,
    point: (s, a) => surfacePoint(s, a, lod === 0 ? -0.0006 : 0),
    color: (_p, _n, s, a) => {
      if (lod === 0) return COLOUR.skin;
      if (sideOf(a) > 2.04) return ventralColour(s, (Math.PI - sideOf(a)) / 1.1);
      const c = dorsalColour(s, a, 1);
      return scale(c, 1 / (0.82 + 0.36 * noise(0.73, 0.11, 3)));
    },
  });
}

const uvOf = (strip: typeof SCALE_STRIP): [number, number] => {
  const r = stripRect(strip);
  return [r.u0 + 0.13, (r.v0 + r.v1) / 2];
};

/** A low pyramid per scale, corners on the lattice so neighbours share positions. */
function diamond(
  b: MeshBuilder,
  q: readonly Vec3[],
  peak: Vec3,
  color: Vec3,
  uv: [number, number],
): void {
  const n = q.length;
  for (let i = 0; i < n; i++) {
    const [p0, p1] = [q[i] as Vec3, q[(i + 1) % n] as Vec3];
    const f = norm(cross(sub(p1, p0), sub(peak, p0)));
    const up = norm(
      sub(peak, scale(add(add(q[0] as Vec3, q[1] as Vec3), add(q[2] as Vec3, q[3] as Vec3)), 0.25)),
    );
    const flip = f[0] * up[0] + f[1] * up[1] + f[2] * up[2] < 0;
    const fn = flip ? scale(f, -1) : f;
    const shade = norm(add(scale(fn, 0.55), scale(up, 0.45)));
    const [a, c] = flip ? [p1, p0] : [p0, p1];
    const i0 = b.vertex({ p: a, n: shade, uv, color });
    const i1 = b.vertex({ p: c, n: shade, uv, color });
    const i2 = b.vertex({ p: peak, n: up, uv, color: scale(color, 1.14) });
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
  const uv = uvOf(SCALE_STRIP);
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
      const raise = 0.0013 * fade;
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
      diamond(
        b,
        d,
        surfacePoint(s + ROW_LENGTH * 0.12, a, raise),
        dorsalColour(s, a, i * 37 + j * 11),
        uv,
      );
    }
  return b.build();
}

/** Ventral scutes: broad plates, one per ventral count, across the belly and the hood's front. */
export function scutes(): Mesh {
  const b = new MeshBuilder();
  const uv = uvOf(SCALE_STRIP);
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
      const color = scale(ventralColour(s0, across), tone);
      const ids = q.map((p, v) =>
        b.vertex({ p, n, uv, color: v < 2 ? scale(color, 0.42) : color }),
      );
      const [i0, i1, i2, i3] = [ids[0] ?? 0, ids[1] ?? 0, ids[2] ?? 0, ids[3] ?? 0];
      if (outward) b.quad(i0, i1, i2, i3);
      else b.quad(i0, i3, i2, i1);
    }
  }
  return b.build();
}

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const sideOf = (a: number): number => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
