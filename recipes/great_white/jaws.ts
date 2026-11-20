// The jaws: a lower jaw that fills the mouth pocket and drops about its rear hinge, and an upper jaw
// (gum arc and teeth) hidden behind the lip until the bite throws it forward. Teeth are built once
// and placed along the mouth arc, large in front, smaller toward the corners.

import { dmath, type Mesh, MeshBuilder, merge, stripRect, type Vec3 } from '@developerz.ai/ts23d';
import {
  clamp,
  cross,
  even,
  loft,
  mix,
  mixRgb,
  noise,
  norm,
  scale,
  smooth,
  spow,
  sub,
} from '../_lib/body-plan-kit.ts';
import { arcX, COLOUR, MOUTH, undersideZ, X_HINGE, X_MOUTH } from './anatomy.ts';
import { SKIN } from './material.ts';

type Lod = 0 | 1 | 2;

/** Lower jaw half-width at x: the mouth arc in front, tucked in toward the hinge. */
const jawHalf = (x: number): number =>
  MOUTH.half *
  0.965 *
  Math.sqrt(clamp((X_MOUTH - x) / MOUTH.depth)) *
  (1 - 0.1 * smooth(X_MOUTH - MOUTH.depth, X_HINGE, x));

const JAW_DEPTH = 0.082;
/** The mouth hangs slightly open at rest, as in photos, so the teeth show. */
export const REST_GAPE = (6 * Math.PI) / 180;
const HINGE_Z = undersideZ(X_HINGE, 0) + 0.05;

/** A lower-jaw point turned down about the jaw hinge by the resting gape. */
function dropped(p: Vec3): Vec3 {
  const [dx, dz] = [p[0] - X_HINGE, p[2] - HINGE_Z];
  const [c, s] = [dmath.cos(REST_GAPE), dmath.sin(REST_GAPE)];
  return [X_HINGE + dx * c + dz * s, p[1], HINGE_Z - dx * s + dz * c];
}

export function lowerJaw(lod: Lod): Mesh {
  const front = X_MOUTH - 0.006;
  const xAt = (u: number): number => mix(front, X_HINGE + 0.004, u);
  const [rings, sides] = lod === 0 ? [22, 30] : lod === 1 ? [10, 12] : [4, 6];
  return loft({
    us: even(0.012, 1, rings),
    sides,
    strip: SKIN,
    metres: [0.4, 0.8],
    stripHeight: 3,
    point: (u, a) => {
      const x = xAt(u);
      // The rear closes on a rounded end inside the throat, not a flat cap.
      const close = Math.sqrt(Math.max(0.0025, 1 - dmath.pow(smooth(0.8, 1, u), 2)));
      const y = jawHalf(x) * close * spow(dmath.cos(a), lod === 0 ? 0.8 : 1);
      const low = undersideZ(x, y) - 0.005;
      const depth = JAW_DEPTH * (1 - smooth(0.72, 1, u) * 0.85);
      return dropped([x, y, low + depth * (0.5 + 0.5 * spow(dmath.sin(a), lod === 0 ? 0.75 : 1))]);
    },
    color: (_p, n) => mixRgb(COLOUR.belly, COLOUR.mouth, smooth(-0.2, 0.3, n[2])),
  });
}

/** One tooth: a flat triangular blade, root at the origin, point along +Z, face toward +X. */
function tooth(root: Vec3, tip: Vec3, face: Vec3, width: number): Mesh {
  const rect = stripRect('plastic');
  const uv: [number, number] = [rect.u0 + 0.1, (rect.v0 + rect.v1) / 2];
  const up = sub(tip, root);
  const side = norm(cross(up, face));
  const f = norm(face);
  const b = new MeshBuilder();
  const w = width / 2;
  const t = width * 0.16;
  const pts: Vec3[] = [
    [root[0] + side[0] * w, root[1] + side[1] * w, root[2] + side[2] * w],
    [root[0] + f[0] * t, root[1] + f[1] * t, root[2] + f[2] * t],
    [root[0] - side[0] * w, root[1] - side[1] * w, root[2] - side[2] * w],
    [root[0] - f[0] * t, root[1] - f[1] * t, root[2] - f[2] * t],
  ];
  const face3 = (a: Vec3, c: Vec3, d: Vec3): void => {
    const raw = cross(sub(c, a), sub(d, a));
    const mid: Vec3 = [
      (a[0] + c[0] + d[0]) / 3,
      (a[1] + c[1] + d[1]) / 3,
      (a[2] + c[2] + d[2]) / 3,
    ];
    const outward =
      raw[0] * (mid[0] - root[0]) + raw[1] * (mid[1] - root[1]) + raw[2] * (mid[2] - root[2]);
    const [q, r] = outward >= 0 ? [c, d] : [d, c];
    const n = norm(outward >= 0 ? raw : [-raw[0], -raw[1], -raw[2]]);
    const color = COLOUR.tooth;
    const i = b.vertex({ p: a, n, uv, color });
    const j = b.vertex({ p: q, n, uv, color });
    const k = b.vertex({ p: r, n, uv, color });
    b.tri(i, j, k);
  };
  pts.forEach((p, i) => {
    face3(p, pts[(i + 1) % 4] ?? p, tip);
  });
  return b.build();
}

const toothSize = (k: number): number => mix(0.052, 0.024, dmath.pow(Math.abs(k), 1.3));

function arcNormal(y: number): Vec3 {
  return norm([1, (2 * MOUTH.depth * y) / (MOUTH.half * MOUTH.half), 0]);
}

function row(count: number, make: (k: number) => Mesh): Mesh[] {
  return Array.from({ length: count }, (_, i) => make(count > 1 ? (2 * i) / (count - 1) - 1 : 0));
}

export function lowerTeeth(lod: Lod): Mesh[] {
  if (lod === 2) return [];
  return row(lod === 0 ? 25 : 11, (k) => {
    const y = k * MOUTH.half * 0.86;
    const x = arcX(y) - 0.035;
    const z = undersideZ(x, y) + JAW_DEPTH - 0.016;
    const s = toothSize(k) * 0.9;
    return tooth(dropped([x, y, z]), dropped([x + 0.008, y, z + s]), arcNormal(y), s * 0.72);
  });
}

export function upperTeeth(lod: Lod): Mesh[] {
  if (lod === 2) return [];
  const rows = lod === 0 ? [0, 1] : [0];
  return rows.flatMap((r) =>
    row(lod === 0 ? 27 : 13, (k) => {
      const y = k * MOUTH.half * 0.9;
      const x = arcX(y) - 0.012 - r * 0.042;
      const z = undersideZ(x, y) + MOUTH.pocket * 0.62;
      const s = toothSize(k) * (r === 0 ? 1 : 0.72);
      const drop = MOUTH.pocket * 0.62 + (r === 0 ? 0.024 : -0.012);
      const tipZ = z - Math.max(s, drop);
      return tooth([x, y, z], [x + 0.004, y, tipZ], arcNormal(y), s * 0.85);
    }),
  );
}

/** Gum of the upper jaw: a fleshy band, scalloped over each tooth, paler at the tooth line. */
export function upperGum(lod: Lod): Mesh {
  const span = MOUTH.half * 0.96;
  const [rings, sides] = lod === 0 ? [108, 12] : lod === 1 ? [16, 6] : [3, 6];
  const teeth = 13;
  return loft({
    us: even(-1, 1, rings),
    sides,
    strip: 'plastic',
    point: (u, a) => {
      const y = u * span;
      const x = arcX(y) - 0.03;
      const z = undersideZ(x, y) + MOUTH.pocket * 0.68;
      const taper = (1 - 0.42 * u * u) * Math.sqrt(Math.max(0.01, 1 - dmath.pow(u, 10)));
      const [rx, rz] = [0.036 * taper, 0.027 * taper];
      return [x + rx * dmath.cos(a), y, z + rz * dmath.sin(a)];
    },
    color: (p, _n, u, a) => {
      // Paler over each tooth, darker in the sockets between them.
      const over = lod === 0 ? 0.55 + 0.45 * dmath.pow(dmath.cos(u * teeth * Math.PI), 2) : 1;
      const low = smooth(0.1, -0.7, dmath.sin(a)) * over;
      const vein = 0.92 + 0.14 * noise(p[1] * 60, u * 9, 4);
      return scale(mixRgb(COLOUR.gumDeep, COLOUR.gum, low), vein);
    },
  });
}

/** The palate behind the gum: what fills the gap when the jaw is thrown forward. */
export function palate(lod: Lod): Mesh {
  const [rings, sides] = lod === 0 ? [14, 18] : lod === 1 ? [5, 8] : [3, 6];
  const front = X_MOUTH - 0.045;
  return loft({
    us: even(0.01, 1, rings),
    sides,
    strip: SKIN,
    metres: [0.3, 0.6],
    stripHeight: 3,
    point: (u, a) => {
      const x = front - u * 0.26;
      const half = MOUTH.half * 0.86 * Math.sqrt(clamp((X_MOUTH - x) / MOUTH.depth, 0.04, 1));
      const nose = 1 - smooth(0, 0.16, u);
      const close = Math.sqrt(
        Math.max(0.01, (1 - dmath.pow(smooth(0.7, 1, u), 2)) * (1 - nose * nose)),
      );
      const y = half * close * dmath.cos(a);
      return [x, y, undersideZ(x, y) + MOUTH.pocket * 0.82 + 0.014 * close * dmath.sin(a)];
    },
    color: (_p, _n, u) => mixRgb(COLOUR.gumDeep, COLOUR.palate, smooth(0, 0.5, u)),
  });
}

export const upperJaw = (lod: Lod): Mesh => merge([palate(lod), upperGum(lod), ...upperTeeth(lod)]);
export const lowerJawFull = (lod: Lod): Mesh => merge([lowerJaw(lod), ...lowerTeeth(lod)]);
