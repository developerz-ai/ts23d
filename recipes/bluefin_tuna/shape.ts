// Atlantic bluefin proportions and trunk surface. t is the fraction of fork length from the snout.
// Fin and depth numbers are percentages of fork length: README.md.

import { hex, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import {
  add,
  clamp,
  even,
  eyeball,
  fbm,
  gauss,
  loft,
  mixRgb,
  noise,
  norm,
  profile,
  scale,
  smooth,
  spow,
  stations,
  sub,
} from '../_lib/body-plan-kit.ts';
import { SKIN, toBand } from './material.ts';

export { SKIN } from './material.ts';

type Lod = 0 | 1 | 2;

export const FL = 2;
export const Z0 = 0.62;
export const X0 = FL / 2;
export const xOf = (t: number): number => X0 - t * FL;
export const tOf = (x: number): number => (X0 - x) / FL;
export const T_TAIL = 0.955;
export const T_HEAD = 0.245;

export const COLOUR = {
  back: hex('#0b1f3f'),
  blue: hex('#14406f'),
  steel: hex('#6d8ba3'),
  silver: hex('#e3e8ea'),
  belly: hex('#fbfbf8'),
  gold: hex('#c9b27a'),
  cheek: hex('#a9b4b8'),
  groove: hex('#1a2430'),
  fin: hex('#17233a'),
  yellow: hex('#c9a53a'),
  finlet: hex('#d6b23a'),
  edge: hex('#14161c'),
  iris: hex('#c8b070'),
  pupil: hex('#050608'),
  iridescent: hex('#8fa6d8'),
  lateral: hex('#3a4a5c'),
  scratch: hex('#f4f2ec'),
  keel: hex('#3a3418'),
} as const;

const halfWidth = profile([
  [0, 0],
  [0.008, 0.012],
  [0.03, 0.036],
  [0.07, 0.074],
  [0.13, 0.122],
  [0.2, 0.166],
  [0.3, 0.205],
  [0.4, 0.218],
  [0.5, 0.206],
  [0.62, 0.162],
  [0.74, 0.106],
  [0.84, 0.058],
  [0.91, 0.03],
  [0.955, 0.016],
  [0.985, 0.006],
]);
const halfTop = profile([
  [0, 0],
  [0.008, 0.012],
  [0.03, 0.04],
  [0.07, 0.083],
  [0.13, 0.137],
  [0.2, 0.19],
  [0.3, 0.243],
  [0.4, 0.26],
  [0.5, 0.246],
  [0.62, 0.197],
  [0.74, 0.133],
  [0.84, 0.074],
  [0.91, 0.036],
  [0.955, 0.019],
  [0.985, 0.006],
]);
const halfBelow = profile([
  [0, 0],
  [0.008, 0.01],
  [0.03, 0.033],
  [0.07, 0.074],
  [0.13, 0.13],
  [0.2, 0.186],
  [0.3, 0.243],
  [0.4, 0.26],
  [0.5, 0.244],
  [0.62, 0.192],
  [0.74, 0.127],
  [0.84, 0.069],
  [0.91, 0.033],
  [0.955, 0.017],
  [0.985, 0.006],
]);

const EXP = 2 / 2.1;

export function plainPoint(t: number, a: number): Vec3 {
  const [s, c] = [Math.sin(a), Math.cos(a)];
  return [
    xOf(t),
    halfWidth(t) * spow(s, EXP),
    Z0 + (c >= 0 ? halfTop(t) : halfBelow(t)) * spow(c, EXP),
  ];
}
export const topZ = (t: number): number => Z0 + halfTop(t);
export const belowZ = (t: number): number => Z0 - halfBelow(t);
export const widthAt = (t: number): number => halfWidth(t);

/** Height share of the mouth line along the head, -1 belly .. 1 back. */
const mouthLine = profile([
  [0.004, -0.1],
  [0.05, -0.34],
  [0.1, -0.47],
  [0.125, -0.5],
]);

/** Rear edge of the gill cover at this section angle: it bulges back at mid-height. */
const coverT = (a: number, base: number): number => {
  const side = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  return base - 0.03 * (side - 1.5) ** 2;
};

interface Marks {
  readonly mouth: number;
  readonly cover: number;
}

function marks(t: number, a: number, h: number): Marks {
  const side = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  const lateral = smooth(0.35, 0.7, side);
  const mouth =
    t < 0.125 ? gauss(h - mouthLine(t), 0.05) * (1 - smooth(0.112, 0.125, t)) * lateral : 0;
  const cover =
    Math.max(
      gauss((t - coverT(a, T_HEAD)) * FL, 0.009),
      0.55 * gauss((t - coverT(a, T_HEAD - 0.045)) * FL, 0.007),
    ) *
    smooth(0.45, 0.8, side) *
    (1 - smooth(2.55, 2.85, side));
  return { mouth, cover };
}

const share = (p: Vec3, t: number): number => (p[2] - Z0) / Math.max(0.01, halfTop(t));

function trunkPoint(t: number, a: number, lod: Lod): Vec3 {
  const p = plainPoint(t, a);
  let [y, z] = [p[1], p[2] - Z0];
  const r = Math.hypot(y, z) || 1;
  if (lod < 2) {
    const m = marks(t, a, share(p, t));
    const e = eyeCentre(y >= 0 ? 1 : -1);
    const dent = gauss(Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]), 0.05);
    const push = -0.009 * m.mouth - 0.009 * m.cover - 0.006 * dent;
    y += (y / r) * push;
    z += (z / r) * push;
  }
  // The median caudal keel, with two small keels behind it on the fin base.
  const keel = keelAt(t);
  y += Math.sign(y) * keel * gauss(z, 0.009 + 0.012 * smooth(0.96, 0.9, t));
  return [p[0], y, Z0 + z];
}

/** Lateral reach of the median caudal keel and the two small keels behind it, metres. */
export const keelAt = (t: number): number =>
  0.046 * smooth(0.865, 0.91, t) * (1 - smooth(0.945, 0.975, t)) +
  0.016 * gauss((t - 0.962) * FL, 0.022);

/** Height share of the lateral line: high behind the head, dipping down over the corselet. */
const lateralLine = (t: number): number =>
  0.42 - 0.3 * smooth(0.22, 0.6, t) + 0.04 * Math.sin(t * 9);

/** The corselet: thick, larger scales round the pectoral base, tapering back along the line. */
export function corseletAt(t: number, h: number): number {
  const along = smooth(0.235, 0.26, t) * (1 - smooth(0.36 + 0.12 * smooth(-0.2, 0.3, h), 0.48, t));
  return along * smooth(-0.55, -0.3, h) * (1 - smooth(0.5, 0.7, h));
}

/** Seeded scratches on the flank (net, rock, a rival's jaw): pale thin lines, 0..1. */
const SCRATCHES: readonly (readonly [number, number, number, number])[] = [
  // t0, h0, t1, h1: the first four on the -Y side the hero camera sees (the third on both), the last on +Y.
  [0.47, 0.42, 0.58, 0.16],
  [0.5, 0.44, 0.6, 0.2],
  [0.62, 0.36, 0.7, 0.12],
  [0.36, 0.5, 0.41, 0.3],
  [0.44, 0.3, 0.55, 0.22],
];
function scratchAt(t: number, h: number, side: number): number {
  let best = 0;
  SCRATCHES.forEach(([t0, h0, t1, h1], i) => {
    if ((i < 4 ? -1 : 1) !== side && i !== 2) return;
    const [dt, dh] = [t1 - t0, h1 - h0];
    const k = Math.max(0, Math.min(1, ((t - t0) * dt + (h - h0) * dh) / (dt * dt + dh * dh)));
    const d = Math.hypot((t - t0 - k * dt) * FL, (h - h0 - k * dh) * 0.45);
    best = Math.max(best, gauss(d, 0.011) * (0.65 + 0.35 * Math.sin(k * 9 + i)));
  });
  return best;
}

function trunkColour(p: Vec3, t: number, a: number, lod: Lod): Vec3 {
  const h = share(p, t);
  const wave = (fbm(t * 16, a, 4) - 0.5) * 0.16;
  const fine = noise(t * 240, a * 34, 7);
  let c = mixRgb(COLOUR.belly, COLOUR.silver, smooth(-0.85, -0.3, h));
  c = mixRgb(c, COLOUR.steel, smooth(-0.1, 0.24, h + wave));
  c = mixRgb(c, COLOUR.blue, smooth(0.12, 0.42, h + wave));
  c = mixRgb(c, COLOUR.back, smooth(0.34, 0.72, h + wave * 0.6));
  // The gold shimmer along the top of the silver, the bluefin's coruscation.
  c = mixRgb(c, COLOUR.gold, 0.32 * gauss(h + wave - 0.02, 0.11) * smooth(0.2, 0.3, t));
  // The iridescent violet-blue band between the blue back and the silver, strongest over the body.
  c = mixRgb(c, COLOUR.iridescent, 0.3 * gauss(h + wave - 0.16, 0.15) * smooth(0.22, 0.32, t));
  // Pale broken bars and dots on the lower flank behind the pectoral.
  const bar = Math.sin(t * 150 + fbm(t * 12, a * 3, 8) * 5);
  const barBand = smooth(-0.66, -0.42, h) * (1 - smooth(0.0, 0.18, h)) * smooth(0.3, 0.38, t);
  if (lod < 2 && bar > 0.45 && fine > 0.3) c = mixRgb(c, COLOUR.belly, 0.9 * barBand);
  if (lod < 2) {
    // The lateral line: a thin darker line of pored scales; scratches cut pale through the sheen.
    const line =
      gauss(h - lateralLine(t), 0.018) * smooth(0.24, 0.3, t) * (1 - smooth(0.85, 0.9, t));
    c = mixRgb(c, COLOUR.lateral, 0.32 * line);
    c = mixRgb(c, COLOUR.scratch, 0.85 * scratchAt(t, h, Math.sign(p[1]) || 1));
  }
  c = mixRgb(c, COLOUR.keel, 0.75 * smooth(0.25, 0.8, keelAt(t) / 0.046) * gauss(h, 0.35));
  if (t < T_HEAD) {
    const cheek = smooth(0.32, -0.05, h) * (1 - smooth(-0.75, -0.55, h) * 0.2);
    c = mixRgb(c, COLOUR.cheek, 0.45 * cheek);
  }
  const m = marks(t, a, h);
  c = mixRgb(c, COLOUR.groove, Math.max(m.mouth * 0.92, m.cover * 0.6));
  return c;
}

export const eyeCentre = (side: 1 | -1): Vec3 => {
  const p = plainPoint(0.091, 1.22);
  return [p[0], p[1] * side, p[2]];
};

export function eye(side: 1 | -1, lod: Lod): Mesh {
  const c = eyeCentre(side);
  const out = norm(add(sub(c, [c[0], 0, Z0]), [0.06, 0, 0]));
  const [rings, sides] = lod === 0 ? [12, 20] : lod === 1 ? [6, 10] : [2, 4];
  return eyeball(add(c, scale(out, -0.017)), 0.026, out, rings, sides, (th) =>
    th < 0.5 ? COLOUR.pupil : th < 0.85 ? COLOUR.iris : COLOUR.groove,
  );
}

const SIDES: readonly [number, number, number] = [72, 36, 9];

export function trunk(joints: readonly number[], lod: Lod): Mesh {
  const end = 0.985;
  const us =
    lod === 2
      ? stations([0.006, 0.03, 0.07, 0.15, ...joints.filter((t) => t > 0.04), 0.9, end])
      : stations(
          [
            ...even(0.004, 0.13, lod === 0 ? 36 : 18),
            ...even(0.13, 0.3, lod === 0 ? 44 : 16),
            ...even(0.3, end, lod === 0 ? 110 : 46),
          ],
          2e-3,
        );
  const sides = SIDES[lod];
  const mesh = loft({
    us,
    sides,
    strip: SKIN,
    metres: [FL, 1.4],
    stripHeight: 1,
    point: (t, a) => trunkPoint(t, a, lod),
    color: (p, _n, t, a) => trunkColour(p, clamp(t), a, lod),
  });
  // The corselet's thicker scales are duller than the polished flank round them.
  const ring = sides + 1;
  return toBand(mesh, (i) => {
    const r = Math.min(us.length - 1, Math.floor(i / ring));
    const t = clamp(us[r] ?? 0);
    const p = plainPoint(t, ((i % ring) / sides) * Math.PI * 2);
    return ['flank', 'corselet', i >= us.length * ring ? 0 : corseletAt(t, share(p, t))];
  });
}
