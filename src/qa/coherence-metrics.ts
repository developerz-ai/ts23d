// Style metrics of one compiled asset, the numbers set coherence compares (src/qa/coherence.ts):
// palette membership (area share of vertex colour within CIEDE2000 of a style colour), texel
// density on the trim sheet (px/m, area-weighted median), bevel width (median altitude of chamfer
// faces: triangles bordering a 20–70° crease, under 10 cm), wear coverage (measured weathering
// area ÷ surface) and the value key (area-weighted mean and spread of L*). All from the mesh, so
// any recipe in any set is measured the same way, without a render.

import type { CompiledAsset, Mesh, Style, Vec3 } from '../core/index.ts';
import { hex, TRIM_SHEET_SIZE } from '../material/index.ts';
import { ciede2000, type Lab, labOfLinear, lightnessOf } from './coherence-colour.ts';

export interface StyleMetrics {
  readonly name: string;
  /** Share of surface area whose colour sits within the style's ΔE of a palette colour. */
  readonly palette: number;
  /** Trim-sheet pixels per metre (area-weighted median over triangles). */
  readonly texelDensity: number;
  /** Median chamfer width, metres (0: no bevels). */
  readonly bevel: number;
  /** Weathered share of the surface (0 when the recipe declares no weathering). */
  readonly wear: number;
  /** Area-weighted mean and standard deviation of value (L* / 100). */
  readonly valueMean: number;
  readonly valueSpread: number;
  /** The most-used off-palette colour (linear RGB) and its area share, for the fix line. */
  readonly offColour?: { readonly rgb: Vec3; readonly share: number };
}

/** Lightness weighting for membership: shade ramps of a palette colour belong to it. */
const KL = 2;
const CREASE: readonly [number, number] = [20, 70];
const MAX_CHAMFER = 0.1;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);

function weightedMedian(pairs: [number, number][]): number {
  if (!pairs.length) return 0;
  pairs.sort((a, b) => a[0] - b[0]);
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let acc = 0;
  for (const [v, w] of pairs) {
    acc += w;
    if (acc >= total / 2) return v;
  }
  return pairs[pairs.length - 1]?.[0] ?? 0;
}

interface Tri {
  readonly area: number;
  readonly normal: Vec3;
  readonly colour: Vec3;
  readonly uvArea: number;
  readonly altitude: number;
}

function triangles(m: Mesh, out: Tri[], edges: Map<string, number[]>): void {
  const P = m.positions;
  const p = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
  const key = (v: Vec3): string => v.map((c) => Math.round(c * 1e4)).join(',');
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const [a, b, c] = ids.map(p) as [Vec3, Vec3, Vec3];
    const n = cross(sub(b, a), sub(c, a));
    const area = len(n) / 2;
    if (area < 1e-12) continue;
    const uv = ids.map((i) => [m.uvs[i * 2] ?? 0, m.uvs[i * 2 + 1] ?? 0]);
    const [u0, u1, u2] = uv as [number[], number[], number[]];
    const uvArea =
      Math.abs(
        ((u1[0] ?? 0) - (u0[0] ?? 0)) * ((u2[1] ?? 0) - (u0[1] ?? 0)) -
          ((u2[0] ?? 0) - (u0[0] ?? 0)) * ((u1[1] ?? 0) - (u0[1] ?? 0)),
      ) / 2;
    const col = (k: number): number =>
      ids.reduce((s, i) => s + (m.colors[i * (m.colors.length / (P.length / 3)) + k] ?? 0), 0) / 3;
    const longest = Math.max(len(sub(b, a)), len(sub(c, b)), len(sub(a, c)));
    const idx = out.length;
    out.push({
      area,
      normal: [n[0] / (2 * area), n[1] / (2 * area), n[2] / (2 * area)],
      colour: [col(0), col(1), col(2)],
      uvArea,
      altitude: (2 * area) / longest,
    });
    const ks = [a, b, c].map(key);
    for (let e = 0; e < 3; e++) {
      const k0 = ks[e] ?? '';
      const k1 = ks[(e + 1) % 3] ?? '';
      const k = k0 < k1 ? `${k0}|${k1}` : `${k1}|${k0}`;
      const list = edges.get(k);
      if (list) list.push(idx);
      else edges.set(k, [idx]);
    }
  }
}

/** Measure one compiled asset against a style. */
export function styleMetrics(asset: CompiledAsset, style: Style): StyleMetrics {
  const tris: Tri[] = [];
  const edges = new Map<string, number[]>();
  for (const part of asset.parts) if (part.mesh) triangles(part.mesh, tris, edges);
  const total = tris.reduce((s, t) => s + t.area, 0) || 1;
  const pal: Lab[] = Object.values(style.palette).map((h) => labOfLinear(hex(h)));
  let inside = 0;
  let vSum = 0;
  let v2Sum = 0;
  const off = new Map<string, { rgb: Vec3; area: number }>();
  const density: [number, number][] = [];
  for (const t of tris) {
    const lab = labOfLinear(t.colour);
    const near = Math.min(...pal.map((p) => ciede2000(lab, p, KL)));
    if (near <= style.paletteDeltaE) inside += t.area;
    else {
      const k = t.colour.map((c) => Math.round(c * 20)).join(',');
      const o = off.get(k) ?? { rgb: t.colour, area: 0 };
      o.area += t.area;
      off.set(k, o);
    }
    const v = lightnessOf(t.colour);
    vSum += v * t.area;
    v2Sum += v * v * t.area;
    if (t.uvArea > 0) density.push([Math.sqrt(t.uvArea / t.area) * TRIM_SHEET_SIZE, t.area]);
  }
  const chamfers: [number, number][] = [];
  const cosLo = Math.cos((CREASE[1] * Math.PI) / 180);
  const cosHi = Math.cos((CREASE[0] * Math.PI) / 180);
  const isChamfer = new Set<number>();
  for (const list of edges.values()) {
    if (list.length !== 2) continue;
    const [i, j] = list as [number, number];
    const a = tris[i]?.normal ?? [0, 0, 1];
    const b = tris[j]?.normal ?? [0, 0, 1];
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d >= cosLo && d <= cosHi) {
      isChamfer.add(i);
      isChamfer.add(j);
    }
  }
  for (const i of isChamfer) {
    const t = tris[i];
    if (t && t.altitude < MAX_CHAMFER) chamfers.push([t.altitude, t.area]);
  }
  const weathered = (asset.weather ?? [])
    .filter((w) => w.lod === asset.lod && !['dents', 'sag', 'warp'].includes(w.effect))
    .reduce((s, w) => s + w.actual * w.area, 0);
  const mean = vSum / total;
  const worst = [...off.values()].sort((a, b) => b.area - a.area)[0];
  return {
    name: asset.name,
    palette: inside / total,
    texelDensity: weightedMedian(density),
    bevel: weightedMedian(chamfers),
    wear: Math.min(1, weathered / total),
    valueMean: mean,
    valueSpread: Math.sqrt(Math.max(0, v2Sum / total - mean * mean)),
    ...(worst ? { offColour: { rgb: worst.rgb, share: worst.area / total } } : {}),
  };
}
