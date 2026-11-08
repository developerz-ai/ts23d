// imperfect(): the shape side of age — dents pressed into flat panels (smooth radial pushes),
// sag on long spans (∝ span², capped), warp (a seeded sideways bow). LOD0/1 only: LOD2 keeps the
// clean silhouette. Dents are placed in each panel's own plane from a seeded stream that never
// reads the tessellation, so LOD0 and LOD1 dent the same spots. Welded vertices move together
// (no cracks); moved vertices get fresh normals so the dent catches light.

import { createRng, type Lod, type Mesh, type WeatherCoverage } from '../core/index.ts';
import { type Panel, panels, spans } from './weather-regions.ts';
import { sceneOf } from './weather-scene.ts';
import { type Scene, select } from './weather-select.ts';
import { DEFAULT_WHERE, type DentEffect, type SpanEffect } from './weather-types.ts';

export interface ImperfectOptions {
  readonly name?: string;
  readonly seed?: number;
  readonly lod?: Lod;
  /** 0..1, scales sag per metre² of span. Default 0.5. */
  readonly age?: number;
  readonly dents?: DentEffect;
  readonly sag?: SpanEffect;
  readonly warp?: SpanEffect;
}

export interface Imperfect {
  readonly mesh: Mesh;
  readonly coverage: readonly WeatherCoverage[];
}

const share = (w: Float32Array, s: Scene, pick: (v: number) => boolean): number => {
  let yes = 0;
  let all = 0;
  for (let v = 0; v < s.s.vertices; v++) {
    if (!pick(v)) continue;
    all += s.s.area[v] ?? 0;
    if ((w[v] ?? 0) >= 0.5) yes += s.s.area[v] ?? 0;
  }
  return all > 0 ? yes / all : 0;
};

/** Index of the panel holding cumulative area `at` (null panels skipped). */
function pickByArea(ok: readonly (Panel | null)[], at: number): number {
  let left = at;
  let last = -1;
  for (let i = 0; i < ok.length; i++) {
    const p = ok[i];
    if (!p) continue;
    last = i;
    left -= p.area;
    if (left <= 0) return i;
  }
  return last;
}

/** Deform `sc.s.mesh`; returns the new mesh and one coverage entry per declared effect. */
export function deform(sc: Scene, o: ImperfectOptions): Imperfect {
  const s = sc.s;
  const lod = o.lod ?? 0;
  const live = lod < 2;
  const name = o.name ?? 'weather';
  const rng = createRng(o.seed ?? 1);
  const disp = new Float64Array(s.groups * 3);
  const mag = new Float64Array(s.groups);
  const out: WeatherCoverage[] = [];
  const entry = (effect: string, where: string, amount: number, area: number): WeatherCoverage => ({
    target: name,
    effect,
    where,
    lod,
    amount,
    actual: 0,
    area,
    tolerance: 0,
  });
  if (o.dents) {
    const d = o.dents;
    const where = d.where ?? DEFAULT_WHERE.dents;
    const radius = d.radius ?? 0.08;
    const depth = d.depth ?? 0.008;
    const range = d.count ?? [1, 3];
    const w = select(sc, where);
    const { panels: all, of } = panels(s, (radius * 2) ** 2);
    const ok = all.map((p, i) => (share(w, sc, (v) => of[v] === i) >= 0.5 ? p : null));
    const area = ok.reduce((t, p) => t + (p?.area ?? 0), 0);
    const r = rng.fork(`${name}:dents`);
    const count = area > 0 ? r.int(range[0], range[1]) : 0;
    let deepest = 0;
    for (let k = 0; k < count && live; k++) {
      const pi = pickByArea(ok, r.next() * area);
      const p = ok[pi];
      const [u0, u1, v0, v1] = p?.range ?? [0, 0, 0, 0];
      const rad = radius * r.range(0.7, 1.2);
      const at = (lo: number, hi: number, t: number): number =>
        hi - lo > 2 * rad ? lo + rad + (hi - lo - 2 * rad) * t : (lo + hi) / 2;
      const pu = at(u0, u1, r.next());
      const pv = at(v0, v1, r.next());
      const dd = depth * r.range(0.55, 1);
      if (!p) continue;
      const c = [0, 1, 2].map((i) => (p.origin[i] ?? 0) + (p.u[i] ?? 0) * pu + (p.v[i] ?? 0) * pv);
      for (let v = 0; v < s.vertices; v++) {
        if (of[v] !== pi) continue;
        const g = s.group[v] ?? 0;
        const dist = Math.hypot(...[0, 1, 2].map((i) => (s.gp[g * 3 + i] ?? 0) - (c[i] ?? 0)));
        if (dist >= rad) continue;
        const f = Math.cos((Math.PI / 2) * (dist / rad)) ** 2 * dd;
        if (f <= (mag[g] ?? 0)) continue;
        mag[g] = f;
        for (let i = 0; i < 3; i++) disp[g * 3 + i] = -(p.normal[i] ?? 0) * f;
        deepest = Math.max(deepest, f);
      }
    }
    out.push({
      ...entry('dents', where, depth, area),
      actual: deepest,
      count: live ? count : 0,
      countRange: range,
    });
  }
  for (const kind of ['sag', 'warp'] as const) {
    const eff = o[kind];
    if (!eff) continue;
    const where = eff.where ?? DEFAULT_WHERE[kind];
    const max = eff.max ?? (kind === 'sag' ? 0.01 : 0.006);
    const w = select(sc, where);
    const r = rng.fork(`${name}:${kind}`);
    let peak = 0;
    let area = 0;
    for (const sp of spans(s, 0.6)) {
      if (share(w, sc, (v) => s.piece[s.group[v] ?? 0] === sp.piece) < 0.5) continue;
      const k = 0.004 * (0.25 + (o.age ?? 0.5)) * (kind === 'warp' ? r.range(0.4, 1) : 1);
      const amp = Math.min(max, k * sp.length * sp.length);
      const sign = kind === 'warp' && r.next() < 0.5 ? -1 : 1;
      for (let v = 0; v < s.vertices; v++)
        if (s.piece[s.group[v] ?? 0] === sp.piece) area += s.area[v] ?? 0;
      if (!live) continue;
      peak = Math.max(peak, amp);
      for (let g = 0; g < s.groups; g++) {
        if (s.piece[g] !== sp.piece) continue;
        const t = ((s.gp[g * 3 + sp.axis] ?? 0) - sp.centre) / (sp.length / 2);
        const off = amp * Math.max(0, 1 - t * t);
        const axis = kind === 'sag' ? 2 : sp.axis === 0 ? 1 : 0;
        disp[g * 3 + axis] = (disp[g * 3 + axis] ?? 0) + (kind === 'sag' ? -off : sign * off);
      }
    }
    out.push({ ...entry(kind, where, max, area), actual: peak });
  }
  return { mesh: live ? moved(sc, disp) : s.mesh, coverage: out };
}

/** Apply per-group displacement and re-derive normals of moved vertices from their triangles. */
function moved(sc: Scene, disp: Float64Array): Mesh {
  const s = sc.s;
  const m = s.mesh;
  const positions = new Float32Array(m.positions);
  const touched = new Uint8Array(s.vertices);
  for (let v = 0; v < s.vertices; v++) {
    const g = s.group[v] ?? 0;
    const dx = disp[g * 3] ?? 0;
    const dy = disp[g * 3 + 1] ?? 0;
    const dz = disp[g * 3 + 2] ?? 0;
    if (dx === 0 && dy === 0 && dz === 0) continue;
    touched[v] = 1;
    positions[v * 3] = (positions[v * 3] ?? 0) + dx;
    positions[v * 3 + 1] = (positions[v * 3 + 1] ?? 0) + dy;
    positions[v * 3 + 2] = (positions[v * 3 + 2] ?? 0) + dz;
  }
  const acc = new Float64Array(s.vertices * 3);
  for (let t = 0; t < m.indices.length; t += 3) {
    const tri = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    if (!tri.some((v) => touched[v])) continue;
    const [a, b, c] = tri as [number, number, number];
    const e = (i: number, k: number): number =>
      (positions[i * 3 + k] ?? 0) - (positions[a * 3 + k] ?? 0);
    const n = [
      e(b, 1) * e(c, 2) - e(b, 2) * e(c, 1),
      e(b, 2) * e(c, 0) - e(b, 0) * e(c, 2),
      e(b, 0) * e(c, 1) - e(b, 1) * e(c, 0),
    ];
    for (const v of tri)
      for (let k = 0; k < 3; k++) acc[v * 3 + k] = (acc[v * 3 + k] ?? 0) + (n[k] ?? 0);
  }
  const normals = new Float32Array(m.normals);
  for (let v = 0; v < s.vertices; v++) {
    if (!touched[v]) continue;
    const l = Math.hypot(acc[v * 3] ?? 0, acc[v * 3 + 1] ?? 0, acc[v * 3 + 2] ?? 0);
    if (l > 0) for (let k = 0; k < 3; k++) normals[v * 3 + k] = (acc[v * 3 + k] ?? 0) / l;
  }
  return { ...m, positions, normals };
}

/** The deform pass on its own: `imperfect(mesh, { dents: { count: [2, 4] }, sag: {} })`. */
export function imperfect(mesh: Mesh, o: ImperfectOptions): Imperfect {
  return deform(sceneOf(mesh, {}, { fasteners: [], touched: [] }), o);
}
