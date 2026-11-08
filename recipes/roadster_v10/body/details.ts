// Body details: the shaped carbon splitter, windscreen (glass + black surround + header rail),
// wipers, hood vent louvres, fender gills, the mouth grille, mirrors, door pulls and lock, the
// fuel filler door, badges (an original hexagon emblem, "V10" side script), the rear plate, and
// the twin stripes for the stripe paint slot. Left-half helpers are mirrored by `bothSides`.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, loft, merge, prism, text } from '@developerz.ai/ts23d';
import { X_COWL, X_DOOR_FRONT, X_DOOR_REAR, X_SCREEN_TOP, Z_SCREEN_TOP } from '../dims.ts';
import { C } from '../lib/colors.ts';
import {
  add,
  along,
  beamBetween,
  bothSides,
  cross,
  lerp,
  lerp3,
  mul,
  rod,
  shift,
  sub,
  tube,
  unit,
} from '../lib/geo.ts';
import { normalAt, patch, type Surface, skin } from '../lib/grid.ts';
import { cover, edges, grille, inward, pocket } from './openings.ts';

const dimC = (c: Vec3): Vec3 => [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5];

import {
  GILLS,
  HOOD_VENT,
  holeG,
  holeUc,
  MOUTH,
  TAILLAMP,
  X_HOOD_REAR,
  X_TRUNK_FRONT,
} from './panels.ts';
import { cockpitU, cockpitY, uAtY, uAtZ } from './regions.ts';
import { S_MAX, S_MIN as S_MIN_TAIL, sAtX, U, U_MAX } from './shape.ts';

// ---------------------------------------------------------------- splitter
/** Carbon splitter: follows the nose plan 4 cm proud of the under-line, 12 mm thick. */
export function splitter(S: Surface, lod: Lod): Mesh {
  const pts: [number, number][] = [];
  const n = [40, 16, 6][lod] ?? 6;
  const s0 = sAtX(1.66, 7);
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((S_MAX - s0) * i) / n;
    const p = S.row(s)(U.rocker);
    const q = S.row(s)(U_MAX);
    const d = unit([p[0] - q[0], p[1] - q[1], 0]);
    pts.push([p[0] + d[0] * 0.035, p[1] + d[1] * 0.035]);
  }
  const outer = pts.filter(([, y]) => y >= 0);
  const profile: [number, number][] = [[1.62, 0], [1.62, (outer[0]?.[1] ?? 0.8) - 0.02], ...outer];
  const full = [
    ...profile,
    ...profile
      .slice(1, -1)
      .reverse()
      .map(([x, y]): [number, number] => [x, -y]),
  ];
  const m = prism({ profile: full, depth: 0.012, plane: 'xy', color: C.carbon, strip: 'plastic' });
  return shift(m, [0, 0, 0.122]);
}

// ---------------------------------------------------------------- windscreen
const SCREEN_W = 0.69; // half-width at the base
const SCREEN_TOP_W = 0.63;

/** Glass grid: base on the cowl, top at the header; wrapped laterally, bowed forward. */
function screenGrid(S: Surface, lod: Lod): { P: Vec3[][]; N: Vec3[][] } {
  const ns = [16, 8, 2][lod] ?? 2;
  const nu = [40, 16, 6][lod] ?? 6;
  const P: Vec3[][] = [];
  const N: Vec3[][] = [];
  const base = (y: number): Vec3 => {
    const s = X_COWL + 0.006;
    const u = uAtY(S, s, Math.abs(y));
    const p = S.row(s)(u);
    return [p[0] - 0.012 * (y / SCREEN_W) ** 2, y, p[2] + 0.004];
  };
  for (let i = 0; i <= ns; i++) {
    const t = i / ns;
    const row: Vec3[] = [];
    for (let j = 0; j <= nu; j++) {
      const f = 1 - (2 * j) / nu;
      const yb = f * SCREEN_W;
      const b = base(yb);
      const top: Vec3 = [
        X_SCREEN_TOP - 0.06 * f * f,
        f * SCREEN_TOP_W,
        Z_SCREEN_TOP - 0.008 - 0.02 * f * f,
      ];
      const p = lerp3(b, top, t);
      // Bow: the glass bulges forward a little mid-height.
      row.push([p[0] + 0.02 * Math.sin(Math.PI * t) * (1 - 0.5 * f * f), p[1], p[2]]);
    }
    P.push(row);
  }
  for (let i = 0; i <= ns; i++) {
    const row: Vec3[] = [];
    for (let j = 0; j <= nu; j++) {
      const p = P[i]?.[j] ?? [0, 0, 0];
      const a = P[Math.min(ns, i + 1)]?.[j] ?? p;
      const b = P[Math.max(0, i - 1)]?.[j] ?? p;
      const c = P[i]?.[Math.min(nu, j + 1)] ?? p;
      const d = P[i]?.[Math.max(0, j - 1)] ?? p;
      // Outward = forward/up: (−y run) × (up the glass).
      let n = unit(cross(sub(d, c), sub(a, b)));
      if (n[0] < 0) n = mul(n, -1);
      row.push(n);
    }
    N.push(row);
  }
  return { P, N };
}

export function windscreen(S: Surface, lod: Lod): { glass: Mesh; frame: Mesh } {
  const { P, N } = screenGrid(S, lod);
  const glass = skin(P, N, { color: C.glass, strip: 'glass', thickness: 0.006 });
  const ns = P.length - 1;
  const nu = (P[0]?.length ?? 1) - 1;
  const segs = [10, 6, 4][lod] ?? 4;
  const fr: Mesh[] = [];
  const pillar = (j: number): Vec3[] => P.map((row) => row[j] ?? [0, 0, 0]);
  const top = P[ns] ?? [];
  // A-pillars and header: a moulded black surround; LOD0 adds the chrome bright strip.
  const sec = lod === 0 ? 0.036 : 0.04;
  for (const j of [0, nu]) fr.push(tube(pillar(j), sec, C.black, 'plastic', segs, 2));
  fr.push(tube(top, 0.04, C.black, 'plastic', segs, 2));
  if (lod === 0) {
    for (const j of [0, nu])
      fr.push(
        tube(
          pillar(j).map((p) => add(p, [0.006, 0, 0.008])),
          0.008,
          C.natural,
          'chrome',
          6,
          2,
        ),
      );
    fr.push(
      tube(
        top.map((p) => add(p, [0.006, 0, 0.018])),
        0.008,
        C.natural,
        'chrome',
        6,
        2,
      ),
    );
    // Rear-view mirror on the header.
    const mid = top[Math.round(nu / 2)] ?? [0, 0, 0];
    fr.push(rod(mid, add(mid, [-0.05, 0, -0.06]), 0.012, C.black, 'plastic', 6));
    fr.push(
      beamBetween(
        add(mid, [-0.06, -0.12, -0.09]),
        add(mid, [-0.06, 0.12, -0.09]),
        0.025,
        0.06,
        C.black,
      ),
    );
    // Black frit band along the base of the glass.
    const band: Vec3[][] = [P[0] ?? [], (P[1] ?? []).map((p, j) => lerp3(P[0]?.[j] ?? p, p, 0.18))];
    const bandP = band.map((r) => r.map((q) => add(q, [0.004, 0, 0.002])));
    const bandN = band.map((r) => r.map((): Vec3 => [0.6, 0, 0.8]));
    fr.push(skin(bandP, bandN, { color: C.black, strip: 'plastic', thickness: 0 }));
  }
  // Base trim strip where the glass meets the cowl.
  fr.push(tube(P[0] ?? [], 0.022, C.black, 'rubber', segs, 1));
  return { glass, frame: merge(fr) };
}

/** Wiper arms parked along the base of the glass (static; cowl-mounted). */
export function wipers(S: Surface, lod: Lod): Mesh {
  if (lod === 2) return merge([]);
  const parts: Mesh[] = [];
  for (const y0 of [0.42, -0.12]) {
    const s = X_COWL + 0.04;
    const p0 = S.row(s)(uAtY(S, s, Math.abs(y0)));
    const piv: Vec3 = [p0[0], y0, p0[2] + 0.01];
    const tip: Vec3 = [X_COWL - 0.02, y0 - 0.5, p0[2] + 0.05];
    parts.push(rod(piv, [piv[0], piv[1], piv[2] + 0.025], 0.03, C.black, 'plastic', 10));
    parts.push(beamBetween([piv[0], piv[1], piv[2] + 0.022], tip, 0.012, 0.01, C.black));
    if (lod === 0)
      parts.push(
        beamBetween(
          add(tip, [0.012, 0.02, -0.01]),
          add(tip, [0.0, 0.46, -0.035]),
          0.01,
          0.014,
          C.black,
          'rubber',
        ),
      );
  }
  return merge(parts);
}

// ---------------------------------------------------------------- vents and gills
/** Hood heat-extractor: a black pocket and five raked louvres across the opening (left). */
export function hoodVent(S: Surface, lod: Lod): Mesh {
  if (lod === 2) return merge([]);
  const h = HOOD_VENT;
  const parts: Mesh[] = [pocket(S, h, 0.05, C.black, 'plastic', lod === 0 ? 20 : 8)];
  const n = lod === 0 ? 7 : 4;
  for (let k = 0; k < n; k++) {
    const s = h.sc - h.hs * 0.85 + (k / (n - 1)) * h.hs * 1.7;
    const g = holeG(h, s);
    if (g < 0.1) continue;
    const c = holeUc(h, s);
    const a = inward(S, s, c - h.hu * g * 0.97, 0.012);
    const b = inward(S, s, c + h.hu * g * 0.97, 0.012);
    const nn = normalAt(S, s, c);
    // Louvre blade: tilted so it hides the bay from the front.
    const tilt: Vec3 = add(mul(nn, -0.018), [-0.02, 0, 0]);
    parts.push(beamBetween(a, b, 0.004, 0.028, C.black));
    parts.push(beamBetween(add(a, tilt), add(b, tilt), 0.004, 0.02, C.black));
  }
  return merge(parts);
}

/** Three gills behind each front wheel: black pockets with a body-colour splitter fin each. */
export function gills(S: Surface, lod: Lod): { black: Mesh; paint: Mesh } {
  if (lod === 2) return { black: merge([]), paint: merge([]) };
  const black: Mesh[] = [];
  for (const h of GILLS) black.push(pocket(S, h, 0.035, C.black, 'plastic', lod === 0 ? 16 : 6));
  return { black: merge(black), paint: merge([]) };
}

/** Mouth: a recessed duct and a two-layer bar grille with a centre blade. */
export function mouth(S: Surface, lod: Lod): Mesh {
  const h = MOUTH;
  const parts: Mesh[] = [];
  // Far: the mouth is a black decal on the uncut fascia.
  if (lod === 2) return cover(S, h, -0.002, C.black, 'plastic', 3);
  // Duct walls (an open-ended pocket: the mouth runs to the centre line, mirrored).
  // Duct walls along the top and bottom edges, running back 9 cm (the right half mirrors).
  const e = edges(S, h, 0.008, lod === 0 ? 24 : 8);
  for (const [line, down] of [
    [e.top, false],
    [e.bottom, true],
  ] as const) {
    const deep = line.map((q) => add(q, [-0.09, 0, 0]));
    const nrm = line.map((): Vec3 => (down ? [0, 0, 1] : [0, 0, -1]));
    const rowsW = down ? [line, deep] : [deep, line];
    parts.push(skin(rowsW, [nrm, nrm], { color: C.black, strip: 'plastic', thickness: 0.004 }));
  }
  // Back wall of the duct (the radiator sits behind it).
  const back = [...e.top].map((q) => add(q, [-0.09, 0, 0]));
  const backB = [...e.bottom].map((q) => add(q, [-0.09, 0, 0]));
  parts.push(
    skin([backB, back], [backB.map((): Vec3 => [1, 0, 0]), back.map((): Vec3 => [1, 0, 0])], {
      color: dimC(C.black),
      strip: 'plastic',
      thickness: 0.004,
    }),
  );
  if (lod === 0) parts.push(grille(S, h, 0.045, 22, 7, 0.004, C.black));
  else parts.push(grille(S, h, 0.045, 8, 3, 0.006, C.black));
  // Horizontal blade across the middle, satin.
  const bl: Vec3[] = [];
  for (let i = 0; i <= 12; i++) {
    const s = h.sc - h.hs + ((S_MAX - (h.sc - h.hs)) * i) / 12;
    const g = holeG(h, s);
    if (g < 0.05) continue;
    bl.push(inward(S, s, holeUc(h, s) + h.hu * g * 0.1, 0.02));
  }
  if (bl.length > 1) parts.push(tube(bl, 0.012, C.carbon, 'plastic', 6, 2, true));
  return merge(parts);
}

// ---------------------------------------------------------------- mirrors, handles, fuel door
/** Door mirror on the left door's front top: an aero housing (paint) on a slim arm, glass back. */
export function mirror(S: Surface, lod: Lod): { paint: Mesh; trim: Mesh } {
  const s = X_DOOR_FRONT - 0.07;
  const root = S.row(s)(U.shoulder);
  const base: Vec3 = [root[0] - 0.01, root[1] - 0.015, root[2] + 0.004];
  const H: Vec3 = [root[0] - 0.035, root[1] + 0.155, root[2] + 0.105];
  const segs = lod === 0 ? 20 : 8;
  const nr = lod === 0 ? 12 : 5;
  const half = 0.105;
  const ring = (y: number, k: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      // Rounded nose forward, nearly flat back where the glass sits.
      const x = cx >= 0 ? 0.058 * cx ** 0.85 : -0.028 * Math.abs(cx) ** 0.22;
      const z = 0.047 * Math.sign(sz) * Math.abs(sz) ** 0.75;
      out.push([H[0] + x * k, H[1] + y, H[2] + z * k - 0.004 * (y / half)]);
    }
    return out;
  };
  const rings: Vec3[][] = [];
  for (let i = 0; i <= nr; i++) {
    const t = -1 + (2 * i) / nr;
    rings.push(ring(t * half, Math.max(0.12, (1 - Math.abs(t) ** 4) ** 0.25)));
  }
  const paint = loft({ rings, color: C.paint, strip: 'plastic', capStart: true, capEnd: true });
  // Glass: a rounded rectangle on the back face.
  const gl = (k: number, dx: number): Vec3[] => {
    const out: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cy = Math.cos(a);
      const sz = Math.sin(a);
      out.push([
        H[0] - 0.029 + dx,
        H[1] + 0.088 * k * Math.sign(cy) * Math.abs(cy) ** 0.4,
        H[2] + 0.034 * k * Math.sign(sz) * Math.abs(sz) ** 0.4,
      ]);
    }
    return out;
  };
  const trim: Mesh[] = [
    loft({
      rings: [gl(1, 0.004), gl(1, -0.0015)],
      color: C.natural,
      strip: 'chrome',
      capEnd: true,
    }),
    tube(
      [
        base,
        [base[0] - 0.01, base[1] + 0.05, base[2] + 0.06],
        [H[0] + 0.01, H[1] - 0.06, H[2] - 0.02],
      ],
      0.02,
      C.black,
      'plastic',
      8,
      3,
    ),
    beamBetween(
      add(base, [0.045, -0.002, -0.004]),
      add(base, [-0.05, -0.002, -0.004]),
      0.034,
      0.016,
      C.black,
    ),
  ];
  return { paint, trim: merge(trim) };
}

/** Flush door pull and key lock on the left door's top rear. */
export function doorHandle(S: Surface, lod: Lod): Mesh {
  if (lod === 2) return merge([]);
  const s = -0.62;
  const u = uAtZ(S, s, 0.79);
  const p = S.row(s)(u);
  const n = normalAt(S, s, u);
  const parts: Mesh[] = [
    beamBetween(
      add(p, mul(n, 0.001)),
      add(add(p, mul(n, 0.001)), [0.14, 0, 0]),
      0.004,
      0.026,
      C.black,
    ),
  ];
  if (lod === 0) {
    parts.push(
      beamBetween(
        add(p, add(mul(n, 0.004), [0.01, 0, 0.004])),
        add(p, add(mul(n, 0.004), [0.13, 0, 0.004])),
        0.003,
        0.012,
        C.natural,
        'chrome',
      ),
    );
    parts.push(
      shift(rod([0, 0, 0], mul(n, 0.004), 0.016, C.natural, 'chrome', 12), add(p, [0.18, 0, 0])),
    );
  }
  return merge(parts);
}

/** Fuel door: a round flap on the left rear deck, hinged on its inboard edge. */
export function fuelDoor(S: Surface): { flap: Mesh; ring: Mesh; hinge: Vec3; axis: Vec3 } {
  const s = -1.62;
  const uc = 2.55;
  const c = S.row(s)(uc);
  const n = normalAt(S, s, uc);
  const r = 0.058;
  const e1 = unit(cross(n, [0, 1, 0]));
  const e2 = unit(cross(n, e1));
  const ring = lathe({
    profile: [
      [r - 0.004, 0],
      [r + 0.004, 0],
    ],
    segments: 32,
    axis: 'z',
    color: C.black,
    strip: 'plastic',
    caps: false,
  });
  const flapM = lathe({
    profile: [
      [0, 0.0022],
      [r - 0.002, 0.0022],
      [r - 0.004, 0.0006],
    ],
    segments: 32,
    axis: 'z',
    color: C.paint,
    strip: 'plastic',
    caps: false,
  });
  const orient = (m: Mesh, lift: number): Mesh =>
    along(along(m, [0, 0, 0], [1, 0, 0]), add(c, mul(n, lift)), e1, n);
  const hinge = add(add(c, mul(e2, r)), mul(n, 0.002));
  void e2;
  // Axis sense chosen so a positive swing lifts the flap off its seat.
  return {
    flap: orient(flapM, 0.0004),
    ring: orient(ring, 0.0008),
    hinge,
    axis: unit(mul(e1, -1)),
  };
}

// ---------------------------------------------------------------- badges and plate
/** Hexagon emblem (original), raised chrome, centred at p facing n. */
export function emblem(p: Vec3, n: Vec3, r: number): Mesh {
  const outer = lathe({
    profile: [
      [0, 0.004],
      [r * 0.85, 0.004],
      [r, 0.0005],
    ],
    segments: 6,
    faceted: true,
    axis: 'z',
    color: C.badge,
    strip: 'chrome',
    caps: false,
  });
  const inner = lathe({
    profile: [
      [0, 0.0055],
      [r * 0.5, 0.0055],
      [r * 0.55, 0.004],
    ],
    segments: 6,
    faceted: true,
    axis: 'z',
    color: C.lensRed,
    strip: 'plastic',
    caps: false,
  });
  const up: Vec3 = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const xAxis = unit(cross(up, n));
  return along(along(merge([outer, inner]), [0, 0, 0], [1, 0, 0]), p, xAxis, n);
}

export function badges(S: Surface, lod: Lod): Mesh {
  if (lod === 2) return merge([]);
  const parts: Mesh[] = [];
  // Nose emblem on the fascia top, above the mouth.
  const sn = sAtX(1.93, 0);
  parts.push(emblem(S.row(sn)(0), normalAt(S, sn, 0), 0.034));
  if (lod === 0)
    for (const side of [1, -1] as const) {
      // "V10" script above the gills, reading front-to-back on each side.
      const s = 0.7;
      const u = uAtZ(S, s, 0.565);
      const p = S.row(s)(u);
      const nn = normalAt(S, s, u);
      parts.push(
        text('V10', {
          origin: [p[0], side * (p[1] + 0.0015), p[2]],
          along: [side > 0 ? 1 : -1, 0, 0],
          up: [0, 0, 1],
          height: 0.028,
          depth: 0.002,
          color: C.badge,
          align: 'centre',
          font: 'block',
          strip: 'chrome',
          surface: () => 0,
        }),
      );
      void nn;
    }
  return merge(parts);
}

/** Trunk-lid emblem (rides on the trunk lid). */
export function trunkBadge(S: Surface): Mesh {
  const s = sAtX(-1.9, 0);
  return emblem(S.row(s)(0), normalAt(S, s, 0), 0.03);
}

/** Rear plate: a recessed black frame with a blank plate and lettering. */
export function rearPlate(S: Surface, lod: Lod): Mesh {
  if (lod === 2) return merge([]);
  const s = -2.32;
  const p = S.row(s)(8.1);
  const c: Vec3 = [p[0] - 0.006, 0, p[2]];
  const parts: Mesh[] = [
    beamBetween([c[0], -0.27, c[2]], [c[0], 0.27, c[2]], 0.014, 0.135, C.black),
    beamBetween(
      [c[0] - 0.006, -0.255, c[2]],
      [c[0] - 0.006, 0.255, c[2]],
      0.004,
      0.11,
      [0.85, 0.85, 0.82],
    ),
  ];
  if (lod === 0)
    parts.push(
      text('TS 23D', {
        origin: [c[0] - 0.009, 0, c[2] - 0.03],
        along: [0, -1, 0],
        up: [0, 0, 1],
        height: 0.06,
        color: [0.08, 0.08, 0.1],
        align: 'centre',
        font: 'block',
        strip: 'plastic',
      }),
    );
  return merge(parts);
}

// ---------------------------------------------------------------- stripes
const STRIPE_IN = 0.045;
const STRIPE_OUT = 0.165;

/** Twin stripes (left stripe; mirror for the right) on a panel's s range, lifted off the paint. */
function stripeOn(S: Surface, s0: number, s1: number, lod: Lod, avoidCockpit = false): Mesh {
  const ns = Math.max(2, Math.ceil(Math.abs(s1 - s0) / ([0.02, 0.06, 0.2][lod] ?? 0.2)));
  return patch(S, {
    s0,
    s1,
    ns,
    nu: lod === 0 ? 6 : 2,
    lo: (s) => (avoidCockpit && cockpitY(s) > 0 ? 0 : uAtY(S, s, STRIPE_IN)),
    hi: (s) => (avoidCockpit && cockpitY(s) > 0 ? 0 : uAtY(S, s, STRIPE_OUT)),
    color: C.paint,
    strip: 'plastic',
    thickness: 0,
    lift: 0.0009,
  });
}

export interface Stripes {
  readonly hood: Mesh;
  readonly trunk: Mesh;
  readonly shell: Mesh;
}

export function stripes(S: Surface, lod: Lod, sHoodFront: number, sTail: number): Stripes {
  const g = 0.004;
  // The nose fascia: until its rows get too narrow to hold the stripe.
  const noseEnd = sAtX(1.86, 0);
  return {
    hood: bothSides(stripeOn(S, X_HOOD_REAR + g, sHoodFront - g, lod)),
    trunk: bothSides(stripeOn(S, sTail + g, X_TRUNK_FRONT - g, lod)),
    shell: bothSides(
      merge([
        stripeOn(S, sHoodFront + g, noseEnd, lod),
        stripeOn(S, X_COWL + 0.01, X_HOOD_REAR - g, lod),
        stripeOn(S, X_TRUNK_FRONT + g, -0.93, lod),
        stripeOn(S, sAtX(-2.12, 0), sTail - g, lod),
      ]),
    ),
  };
}

export const lerpN = lerp;

// ---------------------------------------------------------------- door jambs
/** Body-colour jamb faces behind both door shut lines (left), so the gaps close onto paint. */
export function doorJambs(S: Surface, lod: Lod): Mesh {
  const n = [16, 6, 2][lod] ?? 2;
  const out: Mesh[] = [];
  for (const [s, face] of [
    [X_DOOR_FRONT, -1],
    [X_DOOR_REAR, 1],
  ] as const) {
    const u0 = cockpitU(S, s, s);
    const outer: Vec3[] = [];
    const inner: Vec3[] = [];
    for (let j = 0; j <= n; j++) {
      const u = u0 + ((U.lower - u0) * j) / n;
      const p = sub(S.row(s)(u), mul(normalAt(S, s, u), 0.013));
      outer.push(p);
      inner.push([p[0], Math.min(p[1], 0.7), p[2]]);
    }
    // Rows outer → inner run −y; columns run down: cross gives +x, so flip for a −x face.
    const rowsJ = face > 0 ? [outer, inner] : [inner, outer];
    out.push(
      skin(
        rowsJ,
        rowsJ.map((r) => r.map((): Vec3 => [face, 0, 0])),
        { color: mul(C.paint, 0.8), strip: 'plastic', thickness: 0.003 },
      ),
    );
  }
  return merge(out);
}

// ---------------------------------------------------------------- rear graphic
/** Black rear valance over the tail's lower skin, and the black band joining the lamps (left). */
export function rearBlackout(S: Surface, lod: Lod): Mesh {
  const step = [0.03, 0.08, 0.3][lod] ?? 0.3;
  const sEnd = sAtX(-1.9, 7);
  const valance = patch(S, {
    s0: S_MIN_TAIL,
    s1: sEnd,
    ns: Math.max(2, Math.ceil((sEnd - S_MIN_TAIL) / step)),
    nu: lod === 0 ? 8 : 3,
    lo: () => 7.95,
    hi: () => U_MAX,
    color: C.black,
    strip: 'plastic',
    thickness: 0,
    lift: 0.0015,
  });
  const t = TAILLAMP;
  const band = patch(S, {
    s0: S_MIN_TAIL,
    s1: t.sc - t.hs * 0.98,
    ns: Math.max(2, Math.ceil(0.4 / step)),
    nu: 2,
    lo: () => 6.43,
    hi: () => 6.67,
    color: C.black,
    strip: 'plastic',
    thickness: 0,
    lift: 0.0015,
  });
  return merge([valance, band]);
}
