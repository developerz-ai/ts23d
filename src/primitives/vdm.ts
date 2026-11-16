// VDM stamps (vector displacement, the ZBrush/Mudbox detail brush) as sculpt edits. A stamp is a
// square grid of displacement vectors (right, up, normal) in footprint widths; a placement puts it
// on the surface with a frame (normal + up) and a size. As an SDF edit it displaces the running
// field like a stroke: inverse-map p into each placement's frame (one fixed-point step undoes the
// lateral part), sample the normal part bilinearly, and lower d by it. An envelope in d keeps it
// to a shell around the surface (|d| < H: exactly inert beyond, so the sparse fold's early outs
// are bit-identical) and a normal envelope stops it reaching through to a far surface. Overlapping
// placements combine by max (raises) and min (cuts): shingled scales show the top one. Lipschitz
// cost is DECLARED from the stamp's declared slope; `probeLipschitz` catches a stamp that lies.

import type { Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import type { CompiledStroke } from './sculpt-stroke.ts';
import { compilePlaces, type PlaceTable, placeTable, stampSlope } from './vdm-places.ts';

export { stampSlope } from './vdm-places.ts';

export interface VdmStamp {
  /** Texels per side (≥ 3); the grid spans the footprint [-½, ½]² of unit width. */
  readonly size: number;
  /** size² texels, row-major (v rows, u columns), (right, up, normal) each, in footprint widths. */
  readonly grid: Float32Array;
  /** Declared bound on |∇ normal| per footprint width (bilinear); `vdmStamp` proves it. */
  readonly lipschitz: number;
}

/** One stamp on the surface. */
export interface VdmPlace {
  /** Anchor on the surface (the footprint's centre). */
  readonly at: Vec3;
  /** Outward surface normal (any length). */
  readonly normal: Vec3;
  /** The stamp's +v direction (scale tips point here); made tangent. Default: a world axis. */
  readonly up?: Vec3;
  /** Footprint width, metres. */
  readonly scale: number;
  /** Metres of the stamp's largest normal displacement. Default: its natural height × scale. */
  readonly depth?: number;
}

/** A VDM stamp placed once or many times: one sculpt edit, displacing everything before it. */
export interface SculptVdm {
  readonly vdm: VdmStamp;
  readonly places: readonly VdmPlace[];
  /** Override the sculpt's `mirror`: every placement also mirrored across y = 0. */
  readonly mirror?: boolean;
}

/** The field this displaces is assumed ≤ 1.25-Lipschitz (the sculpt base, as `sdf` assumes). */
const BASE_L = 1.25;

/**
 * A checked stamp: finite, square, zero on its edge ring (so it fades into the surface). Its
 * Lipschitz is computed; a `declared` value below the true slope is refused.
 */
export function vdmStamp(size: number, grid: Float32Array, declared?: number): VdmStamp {
  if (!(Number.isInteger(size) && size >= 3))
    invalid(`vdm stamp size is ${size}`, 'use an integer ≥ 3 texels per side (33 is typical)');
  if (grid.length !== size * size * 3)
    invalid(
      `vdm stamp grid has ${grid.length} floats, not ${size}² × 3`,
      'store (right, up, normal) per texel, row-major',
    );
  if (!grid.every(Number.isFinite)) invalid('vdm stamp grid has a NaN', 'fill every texel');
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      if (i > 0 && j > 0 && i < size - 1 && j < size - 1) continue;
      const k = (j * size + i) * 3;
      if (
        Math.abs(grid[k + 2] ?? 0) > 1e-6 ||
        Math.abs(grid[k] ?? 0) + Math.abs(grid[k + 1] ?? 0) > 1e-6
      )
        invalid(
          `vdm stamp edge texel (${i}, ${j}) is not 0`,
          'window the map so its border ring is zero (it must fade into the surface)',
        );
    }
  if (!grid.some((x, k) => k % 3 === 2 && x !== 0))
    invalid('vdm stamp has no normal displacement', 'give the stamp some height');
  const slope = stampSlope(size, grid, 2);
  if (declared !== undefined && !(declared >= slope * (1 - 1e-6)))
    invalid(
      `vdm stamp declares Lipschitz ${declared}, but its slope is ${slope.toFixed(3)}`,
      'declare at least the computed slope, or omit it to use the computed value',
    );
  return { size, grid, lipschitz: declared ?? slope };
}

/** One placement as a sculpt edit; `places` for many (vdm-scatter.ts makes them). */
export const vdmEdit = (vdm: VdmStamp, place: VdmPlace): SculptVdm => ({ vdm, places: [place] });

/** Bilinear sample of the stamp at (u, v) ∈ [-½, ½]² into out (zero outside). */
export function sampleStamp(s: VdmStamp, u: number, v: number, out: Float64Array): void {
  const n = s.size - 1;
  const x = (u + 0.5) * n;
  const y = (v + 0.5) * n;
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  if (!(x >= 0 && y >= 0 && x <= n && y <= n)) return;
  const i = Math.min(Math.floor(x), n - 1);
  const j = Math.min(Math.floor(y), n - 1);
  const fx = x - i;
  const fy = y - j;
  const g = s.grid;
  const a = (j * s.size + i) * 3;
  const b = a + s.size * 3;
  for (let c = 0; c < 3; c++) {
    const top = (g[a + c] ?? 0) + ((g[a + 3 + c] ?? 0) - (g[a + c] ?? 0)) * fx;
    const bot = (g[b + c] ?? 0) + ((g[b + 3 + c] ?? 0) - (g[b + c] ?? 0)) * fx;
    out[c] = top + (bot - top) * fy;
  }
}

/** Smootherstep plateau: 1 for |x| ≤ ½, falling to 0 at |x| = 1; max |slope| 3.75. */
const plateau = (x: number): number => {
  const a = x < 0 ? -x : x;
  if (a <= 0.5) return 1;
  if (a >= 1) return 0;
  const u = (a - 0.5) * 2;
  return 1 - u * u * u * (10 - 15 * u + 6 * u * u);
};

/** The edit as a displacement (stroke contract) plus `depth`, the most it moves the surface. */
export function compileVdm(
  e: SculptVdm,
  where: string,
  mirror: boolean,
): CompiledStroke & { readonly depth: number } {
  const t: PlaceTable = compilePlaces(e, where, e.mirror ?? mirror);
  const { shell: H, reach: W } = t;
  const s = e.vdm;
  const out = new Float64Array(3);
  const cand = placeTable(t);
  // Per placement (15 floats): at, right, up, normal, 1/scale, warp a, height k.
  const P = t.data;
  const pos = t.hasPos;
  const neg = t.hasNeg;
  const apply = (p: Vec3, d: number): number => {
    const ed = plateau(d / H);
    if (ed === 0) return d;
    const list = cand(p);
    if (!list) return d;
    let up = 0;
    let down = 0;
    for (let m = 0; m < list.length; m++) {
      const o = (list[m] ?? 0) * 15;
      const rx = p[0] - (P[o] ?? 0);
      const ry = p[1] - (P[o + 1] ?? 0);
      const rz = p[2] - (P[o + 2] ?? 0);
      const w = rx * (P[o + 9] ?? 0) + ry * (P[o + 10] ?? 0) + rz * (P[o + 11] ?? 0);
      const en = plateau(w / W);
      if (en === 0) continue;
      const inv = P[o + 12] ?? 0;
      const u = (rx * (P[o + 3] ?? 0) + ry * (P[o + 4] ?? 0) + rz * (P[o + 5] ?? 0)) * inv;
      const v = (rx * (P[o + 6] ?? 0) + ry * (P[o + 7] ?? 0) + rz * (P[o + 8] ?? 0)) * inv;
      if (u <= -0.5 || u >= 0.5 || v <= -0.5 || v >= 0.5) continue;
      sampleStamp(s, u, v, out);
      const a = P[o + 13] ?? 0;
      sampleStamp(s, u - a * (out[0] ?? 0), v - a * (out[1] ?? 0), out);
      const h = en * (P[o + 14] ?? 0) * (out[2] ?? 0);
      if (h > up) up = h;
      else if (h < down) down = h;
    }
    const h = up + down;
    return h === 0 ? d : d - ed * h;
  };
  // |∇d'| ≤ L_d (1 + D · 3.75 / H) + (pos && neg ? 2 : 1) · max over places of
  //   (k · L_s (1 + a · L_w) / scale + D_i · 3.75 / W).
  const extra = BASE_L * t.depth * (3.75 / H) + (pos && neg ? 2 : 1) * t.slope;
  return { apply, c: t.c, r: t.r, extra, depth: t.depth };
}

/**
 * Meshing bounds: where the displaced surface can be. It stays within `depth` of the surface it
 * displaces, inside a footprint, so: every anchor ± (footprint half-diagonal + depth). (The fold's
 * influence sphere is wider: it also covers the normal reach, where the edit is merely inert.)
 */
export function vdmBounds(e: SculptVdm, mirror: boolean): [Vec3, Vec3] {
  const t = compilePlaces(e, 'vdm', e.mirror ?? mirror);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.count; i++) {
    const g = Math.SQRT1_2 / (t.data[i * 15 + 12] ?? 1) + t.depth;
    for (let j = 0; j < 3; j++) {
      const a = t.data[i * 15 + j] ?? 0;
      lo[j] = Math.min(lo[j] ?? 0, a - g);
      hi[j] = Math.max(hi[j] ?? 0, a + g);
    }
  }
  return [lo, hi];
}
