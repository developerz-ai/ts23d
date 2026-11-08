// Ultra-high-performance tyre, local frame: axle along Y, outer sidewall toward +Y, centre at
// the origin. LOD0: a real directional tread band — four circumferential grooves plus raked
// shoulder slots and centre-rib sipes — meshed on a sheared grid so every groove wall lands on a
// vertex row (crisp walls, no aliasing), and a moulded sidewall with rim protector, bead and
// raised rings. LOD1: grooves in the lathe profile. LOD2: a plain 10-sided drum.

import {
  type Lod,
  lathe,
  type Mesh,
  MeshBuilder,
  merge,
  stripRect,
  type Vec2,
  type Vec3,
} from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { cross, sub, unit } from '../lib/geo.ts';

export interface TyreSize {
  readonly width: number;
  /** Bead seat radius (rim diameter / 2). */
  readonly rim: number;
  /** Sidewall height. */
  readonly side: number;
}

const GROOVE_W = 0.011;
const GROOVE_D = 0.007;
const SLOT_D = 0.0055;
const SIPE_D = 0.003;

/** Section profile (radius, y) from the inner bead round the crown to the outer bead. */
function casing(t: TyreSize, grooves: boolean): Vec2[] {
  const R = t.rim + t.side;
  const hw = t.width / 2;
  const sw = hw * 1.02; // sidewall bulge beyond the tread
  const prof: Vec2[] = [
    [t.rim + 0.004, -hw * 0.86],
    [t.rim + 0.012, -hw * 0.93], // bead / rim protector
    [t.rim + t.side * 0.35, -sw],
    [t.rim + t.side * 0.7, -sw * 0.99],
    [R - 0.014, -hw * 0.97],
    [R - 0.004, -hw * 0.9], // shoulder round
  ];
  const top: Vec2[] = [];
  if (grooves) {
    const gs = [-0.62, -0.24, 0.24, 0.62];
    top.push([R, -hw * 0.84]);
    for (const g of gs) {
      const c = g * hw;
      top.push([R, c - GROOVE_W / 2], [R - GROOVE_D, c - GROOVE_W / 2 + 0.001]);
      top.push([R - GROOVE_D, c + GROOVE_W / 2 - 0.001], [R, c + GROOVE_W / 2]);
    }
    top.push([R, hw * 0.84]);
  } else top.push([R, -hw * 0.84], [R, hw * 0.84]);
  return [...prof, ...top, ...prof.map(([r, y]): Vec2 => [r, -y]).reverse()];
}

/** Sidewall + crown as a lathe (LOD1/2), or sidewalls only (LOD0 adds the tread band). */
function sidewalls(t: TyreSize, segments: number, grooves: boolean): Mesh {
  return lathe({
    profile: casing(t, grooves),
    segments,
    axis: 'y',
    color: C.rubber,
    strip: 'rubber',
    caps: false,
    creaseDeg: 50,
  });
}

/** Tread depth at lateral position w (−1..1 of half-width) and pitch phase f (0..1). */
interface Band {
  readonly w: number[];
  readonly f: number[];
}

/** Column positions (fraction of half-width) with a vertex on each side of every groove wall. */
function columns(): number[] {
  const out = new Set<number>();
  for (let k = 0; k <= 16; k++) out.add(-0.86 + (1.72 * k) / 16);
  for (const g of [-0.62, -0.24, 0.24, 0.62])
    for (const d of [-1, 1]) {
      const e = g + (d * GROOVE_W) / 2 / 0.1475;
      out.add(e - 0.004);
      out.add(e + 0.004);
    }
  return [...out].filter((w) => w >= -0.86 && w <= 0.86).sort((a, b) => a - b);
}

/** Phase samples within one tread pitch: land, slot walls (0.70–0.80), sipe (0.32–0.35). */
const PHASES = [0, 0.16, 0.315, 0.325, 0.345, 0.355, 0.52, 0.695, 0.705, 0.795, 0.805, 0.9];

function depth(w: number, f: number, hwm: number): number {
  const aw = Math.abs(w);
  const gw = GROOVE_W / 2 / hwm;
  for (const g of [0.62, 0.24]) if (Math.abs(aw - g) < gw) return GROOVE_D;
  if (aw > 0.62 && f > 0.7 && f < 0.8) return SLOT_D; // shoulder slots
  if (aw > 0.24 && aw < 0.62 && f > 0.32 && f < 0.35 && aw < 0.5) return SIPE_D; // sipes
  if (aw < 0.24 && f > 0.7 && f < 0.8 && aw > 0.08) return SIPE_D; // centre-rib notches
  return 0;
}

/** The LOD0 tread band: pitches × phases around, sheared into a directional V. */
function treadBand(t: TyreSize, pitches: number): Mesh {
  const R = t.rim + t.side;
  const hw = t.width / 2;
  const cols = columns();
  const band: Band = { w: cols, f: PHASES };
  const rect = stripRect('rubber');
  const b = new MeshBuilder();
  const n = pitches * band.f.length;
  const P: Vec3[][] = [];
  for (let i = 0; i <= n; i++) {
    const p = Math.floor(i / band.f.length);
    const f = band.f[i % band.f.length] ?? 0;
    const row: Vec3[] = [];
    for (const w of band.w) {
      // Directional V: the slot rakes back from the centre (0.09 rad at the shoulder).
      const th = ((p + f) / pitches) * Math.PI * 2 + Math.abs(w) * 0.09;
      const d = depth(w, f, hw);
      const r = R - d;
      row.push([r * Math.cos(th), w * hw, r * Math.sin(th)]);
    }
    P.push(row);
  }
  const m = band.w.length;
  const idx: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const row: number[] = [];
    for (let j = 0; j < m; j++) {
      const p = P[i]?.[j] ?? [0, 0, 0];
      const a = P[Math.min(n, i + 1)]?.[j] ?? p;
      const c = P[Math.max(0, i - 1)]?.[j] ?? p;
      const d = P[i]?.[Math.min(m - 1, j + 1)] ?? p;
      const e = P[i]?.[Math.max(0, j - 1)] ?? p;
      let nrm = unit(cross(sub(d, e), sub(a, c)));
      const radial = unit([p[0], 0, p[2]]);
      if (nrm[0] * radial[0] + nrm[2] * radial[2] < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      // Groove floors and walls darker (dust, no wear polish).
      const dark = Math.hypot(p[0], p[2]) < R - 0.001 ? 0.62 : 1;
      row.push(
        b.vertex({
          p,
          n: nrm,
          uv: [rect.u0 + (i / n) * 4, rect.v0 + ((j / (m - 1)) * 0.9 + 0.05) * (rect.v1 - rect.v0)],
          color: [C.rubber[0] * dark, C.rubber[1] * dark, C.rubber[2] * dark],
        }),
      );
    }
    idx.push(row);
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j + 1 < m; j++) {
      const a = idx[i]?.[j] ?? 0;
      const bb = idx[i + 1]?.[j] ?? 0;
      const c = idx[i + 1]?.[j + 1] ?? 0;
      const d = idx[i]?.[j + 1] ?? 0;
      // Outward = +radial: (θ increasing) × (w increasing) points inward, so wind a-d-c-b.
      b.quad(a, d, c, bb);
    }
  return b.build();
}

/** Raised sidewall rings and a rim protector rib (outer face only), LOD0. */
function sidewallRings(t: TyreSize, segments: number): Mesh {
  const hw = t.width / 2;
  const sw = hw * 1.02;
  const ringAt = (r: number, h: number, w: number): Mesh =>
    lathe({
      profile: [
        [r - w / 2, sw * 0.995],
        [r - w / 4, sw * 0.995 + h],
        [r + w / 4, sw * 0.995 + h],
        [r + w / 2, sw * 0.995],
      ],
      segments,
      axis: 'y',
      color: C.rubber,
      strip: 'rubber',
      caps: false,
    });
  return merge([
    ringAt(t.rim + t.side * 0.52, 0.0015, 0.006),
    ringAt(t.rim + t.side * 0.78, 0.0012, 0.004),
  ]);
}

export function tyre(lod: Lod, t: TyreSize): Mesh {
  if (lod === 2)
    return lathe({
      profile: [
        [t.rim + 0.01, -t.width * 0.47],
        [t.rim + t.side * 0.6, -t.width * 0.51],
        [t.rim + t.side, -t.width * 0.42],
        [t.rim + t.side, t.width * 0.42],
        [t.rim + t.side * 0.6, t.width * 0.51],
        [t.rim + 0.01, t.width * 0.47],
      ],
      segments: 10,
      axis: 'y',
      color: C.rubber,
      strip: 'rubber',
      caps: false,
    });
  if (lod === 1) return sidewalls(t, 28, true);
  const segs = 144;
  return merge([casingNoTread(t, segs), treadBand(t, 64), sidewallRings(t, segs)]);
}

/** LOD0 casing: sidewalls and shoulders up to the tread band's edges. */
function casingNoTread(t: TyreSize, segments: number): Mesh {
  const all = casing(t, false);
  // Drop the crown points (the band replaces them) but keep the shoulder edge at ±0.86 hw.
  const R = t.rim + t.side;
  const hw = t.width / 2;
  const half = all.length / 2;
  const left = all.slice(0, half - 1);
  const right = all.slice(half + 1);
  const prof: Vec2[] = [...left, [R, -hw * 0.86]];
  const prof2: Vec2[] = [[R, hw * 0.86], ...right];
  const opts = {
    segments,
    axis: 'y' as const,
    color: C.rubber,
    strip: 'rubber' as const,
    caps: false,
    creaseDeg: 50,
  };
  return merge([lathe({ ...opts, profile: prof }), lathe({ ...opts, profile: prof2 })]);
}

/** Outer free radius (for arch and measure maths). */
export const tyreRadius = (t: TyreSize): number => t.rim + t.side;
