// Nature strips on a terrain mesh by slope and altitude: snow above the snowline where the slope
// holds it, cliff on steep faces, gravel on scree slopes and high bare ground, grass above the
// treeline, moss on the forest floor, layered rock on the tile's cut sides. The mesh is unwelded so
// each triangle owns its UVs (one band per triangle, true-scale top-down projection); vertex
// colour stays as a half-strength tint so the strips keep their hue.

import type { Mesh } from '../core/index.ts';
import { DEFAULT_SHEET, type StripId, stripRect } from '../material/index.ts';

export interface StripRules {
  /** Altitude (m) of z = 0 and metres of altitude per unit of z (1 / (scale · exaggeration)). */
  readonly datum: number;
  readonly perZ: number;
  readonly treeline: number;
  readonly snowline: number;
  /** Slope (rise/run) where cliff takes over; default 0.85. */
  readonly rockSlope?: number;
  /** Steepest slope that holds snow; default 1.1. */
  readonly snowSlope?: number;
  /** Slope where soil gives way to scree/gravel; default 0.55 (≈ 29°). */
  readonly screeSlope?: number;
}

function unweld(m: Mesh): Mesh {
  const n = m.indices.length;
  const pick = (src: Float32Array, k: number): Float32Array => {
    const out = new Float32Array(n * k);
    for (let t = 0; t < n; t++) {
      const v = m.indices[t] ?? 0;
      for (let c = 0; c < k; c++) out[t * k + c] = src[v * k + c] ?? 0;
    }
    return out;
  };
  return {
    positions: pick(m.positions, 3),
    normals: pick(m.normals, 3),
    uvs: pick(m.uvs, 2),
    colors: pick(m.colors, 3),
    indices: Uint32Array.from({ length: n }, (_, i) => i),
  };
}

function stripOf(z: number, nz: number, r: StripRules): StripId {
  const steep = Math.sqrt(Math.max(0, 1 - nz * nz)) / Math.max(nz, 1e-3);
  if (nz < 0.05) return 'rock_strata';
  if (z > r.snowline && steep < (r.snowSlope ?? 1.1)) return 'snow';
  if (steep > (r.rockSlope ?? 0.85)) return 'cliff';
  if (steep > (r.screeSlope ?? 0.55) || z > r.treeline + 250) return 'gravel';
  return z > r.treeline ? 'grass' : 'moss';
}

export function groundStrips(m: Mesh, r: StripRules): Mesh {
  const u = unweld(m);
  const uvs = new Float32Array(u.uvs);
  const colors = new Float32Array(u.colors);
  const P = u.positions;
  const half = 0.5 / 4096;
  for (let t = 0; t < u.indices.length; t += 3) {
    const ids = [t, t + 1, t + 2];
    const z = r.datum + (ids.reduce((s, i) => s + (P[i * 3 + 2] ?? 0), 0) / 3) * r.perZ;
    const nz = ids.reduce((s, i) => s + (u.normals[i * 3 + 2] ?? 1), 0) / 3;
    const id = stripOf(z, nz, r);
    const rect = stripRect(id);
    const vm = DEFAULT_SHEET.strips[id]?.scaleMetres ?? 1;
    // Strata and cliff run their beds horizontally: project those onto the vertical plane.
    const side = id === 'rock_strata' || id === 'cliff';
    const vOf = (i: number): number => (side ? (P[i * 3 + 2] ?? 0) : (P[i * 3 + 1] ?? 0));
    const vs = ids.map(vOf);
    const base = Math.floor(Math.min(...vs) / vm) * vm;
    const k = Math.min(1, vm / Math.max(1e-6, Math.max(...vs) - base));
    for (const i of ids) {
      const along = side ? (P[i * 3] ?? 0) + (P[i * 3 + 1] ?? 0) : (P[i * 3] ?? 0);
      uvs[i * 2] = rect.u0 + (along / rect.metres) * (rect.u1 - rect.u0);
      const f = ((vOf(i) - base) / vm) * k;
      uvs[i * 2 + 1] = rect.v0 + half + Math.min(1, f) * (rect.v1 - rect.v0 - 2 * half);
      for (let c = 0; c < 3; c++) colors[i * 3 + c] = 0.55 + 0.45 * (colors[i * 3 + c] ?? 0);
    }
  }
  return { ...u, uvs, colors };
}
