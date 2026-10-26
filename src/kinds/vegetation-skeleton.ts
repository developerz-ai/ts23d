// The botanical skeleton: Weber–Penn recursive stems as plain polylines + radii. Always grown at
// full depth and LOD0 resolution from one seeded stream, so every LOD is the same tree; meshing
// decides what to emit. Children start inside their parent (centre offset r_parent − r_child along
// the attachment normal), so each one physically grows out of the bark.

import type { Rng, Vec3 } from '../core/index.ts';
import { arcLengths, transportFrames } from '../primitives/index.ts';
import { type BranchLevel, shapeRatio, type TreeParams } from './vegetation-params.ts';

export interface Stem {
  readonly level: number;
  readonly pts: readonly Vec3[];
  readonly radii: readonly number[];
  readonly length: number;
  /** Index of the parent stem, −1 for the trunk. */
  readonly parent: number;
  /** Attachment point on the parent's bark (cluster cards root here at LOD1). */
  readonly surface: Vec3;
  /** Nominal length before shape/variation: drives the child count. */
  readonly maxLength: number;
}

const deg = Math.PI / 180;
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Rodrigues rotation of v about unit axis k by angle a (radians). */
export function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d = (k[0] * v[0] + k[1] * v[1] + k[2] * v[2]) * (1 - c);
  return [
    v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * d,
    v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * d,
    v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * d,
  ];
}

/** Axis that turns `dir` towards +Z when rotated by a positive angle. */
function upAxis(dir: Vec3): Vec3 {
  const k: Vec3 = [dir[1], -dir[0], 0]; // dir × Z
  return Math.hypot(k[0], k[1]) < 1e-4 ? [0, 1, 0] : unit(k);
}

/** A stem's polyline: `res` segments, bending by curve/curveBack plus seeded wobble. */
function path(start: Vec3, dir0: Vec3, len: number, lv: BranchLevel, trunk: boolean, rng: Rng) {
  const res = Math.max(1, lv.segments);
  const step = len / res;
  const pts: Vec3[] = [start];
  let dir = dir0;
  let p = start;
  for (let i = 0; i < res; i++) {
    const half = lv.curveBack !== undefined && i >= res / 2;
    const bend = half
      ? (lv.curveBack ?? 0) / Math.ceil(res / 2)
      : (lv.curve ?? 0) / (lv.curveBack !== undefined ? Math.max(1, Math.floor(res / 2)) : res);
    const wob = lv.curveVar ?? 0;
    // The trunk stays in the XZ plane and bends about Y: + curve swings it back against the lean
    // (−X), so a leaning palm bows and its crown comes back over its base.
    if (trunk) dir = rotate(dir, [0, 1, 0], -(bend + rng.range(-wob, wob)) * deg);
    else {
      dir = rotate(dir, upAxis(dir), (bend + rng.range(-wob, wob)) * deg);
      dir = rotate(dir, [0, 0, 1], rng.range(-wob, wob) * deg);
    }
    dir = unit(dir);
    p = [p[0] + dir[0] * step, p[1] + dir[1] * step, p[2] + dir[2] * step];
    pts.push(p);
  }
  return pts;
}

export function grow(p: TreeParams, size: { height: number; dbh: number }, rng: Rng): Stem[] {
  const t0 = p.levels[0];
  if (!t0) return [];
  const L0 = size.height * t0.length;
  const r0 = size.dbh / 2;
  const lean = (p.lean ?? 0) * deg;
  const trunkPts = path([0, 0, -0.05], [Math.sin(lean), 0, Math.cos(lean)], L0, t0, true, rng);
  const arc0 = arcLengths(trunkPts);
  const bh = 1.3; // breast height, metres (forestry DBH convention)
  const trunkR = arc0.map((s) => {
    const f = Math.max(0, (s - bh) / Math.max(0.1, L0 - bh));
    return r0 * (1 - (1 - p.taper) * f);
  });
  const stems: Stem[] = [
    {
      level: 0,
      pts: trunkPts,
      radii: trunkR,
      length: L0,
      parent: -1,
      surface: [0, 0, 0],
      maxLength: L0,
    },
  ];
  for (let si = 0; si < stems.length; si++) {
    const par = stems[si];
    const lv = par ? p.levels[par.level + 1] : undefined;
    if (!par || !lv) continue;
    const arc = arcLengths(par.pts);
    const frames = transportFrames(par.pts);
    const s0 = (par.level === 0 ? p.baseSize : (lv.start ?? 0.1)) * par.length;
    const s1 = par.length * 0.97;
    const fill = par.level === 0 ? 1 : Math.min(1, par.length / par.maxLength);
    const n = par.level === 0 ? lv.branches : Math.round(lv.branches * (0.25 + 0.75 * fill));
    let phi = rng.range(0, 360);
    for (let i = 0; i < n; i++) {
      const s = s0 + ((s1 - s0) * (i + rng.range(0.15, 0.85))) / Math.max(1, n);
      let j = 0;
      while (j < arc.length - 2 && (arc[j + 1] ?? 0) < s) j++;
      const a = par.pts[j] ?? [0, 0, 0];
      const b = par.pts[j + 1] ?? a;
      const f = (s - (arc[j] ?? 0)) / ((arc[j + 1] ?? 1) - (arc[j] ?? 0) || 1);
      const c: Vec3 = [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ];
      const rp = (par.radii[j] ?? 0) * (1 - f) + (par.radii[j + 1] ?? 0) * f;
      const T = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const fr = frames[j] ?? { n: [1, 0, 0], b: [0, 1, 0] };
      phi += (lv.rotate ?? 137.5) + rng.range(-10, 10);
      const cp = Math.cos(phi * deg);
      const sp = Math.sin(phi * deg);
      const raw: Vec3 = [
        cp * fr.n[0] + sp * fr.b[0],
        cp * fr.n[1] + sp * fr.b[1],
        cp * fr.n[2] + sp * fr.b[2],
      ];
      const tdot = raw[0] * T[0] + raw[1] * T[1] + raw[2] * T[2];
      const np = unit([raw[0] - tdot * T[0], raw[1] - tdot * T[1], raw[2] - tdot * T[2]]);
      const zone = (s - s0) / Math.max(1e-6, s1 - s0);
      const down = (lv.downAngle + (lv.downAngleV ?? 0) * zone + rng.range(-5, 5)) * deg;
      const dir = unit([
        T[0] * Math.cos(down) + np[0] * Math.sin(down),
        T[1] * Math.cos(down) + np[1] * Math.sin(down),
        T[2] * Math.cos(down) + np[2] * Math.sin(down),
      ]);
      const vary = 1 + rng.range(-(lv.lengthVar ?? 0.15), lv.lengthVar ?? 0.15);
      const maxLength = lv.length * par.length;
      const base =
        par.level === 0
          ? maxLength * shapeRatio(p.shape, (par.length - s) / Math.max(1e-6, par.length - s0))
          : lv.length * (par.length - 0.6 * s);
      const len = Math.max(0.15, base * vary);
      const r0c = par.radii[0] ?? rp;
      const rc = Math.max(0.006, Math.min(0.8 * rp, r0c * (len / par.length) ** p.ratioPower));
      const start: Vec3 = [
        c[0] + np[0] * (rp - rc),
        c[1] + np[1] * (rp - rc),
        c[2] + np[2] * (rp - rc),
      ];
      const pts = path(start, dir, len, lv, false, rng);
      stems.push({
        level: par.level + 1,
        pts,
        radii: pts.map((_, k) => rc * (1 - (0.75 * k) / Math.max(1, pts.length - 1))),
        length: len,
        parent: si,
        surface: [c[0] + np[0] * rp, c[1] + np[1] * rp, c[2] + np[2] * rp],
        maxLength,
      });
    }
  }
  return stems;
}
