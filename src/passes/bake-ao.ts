// Ambient occlusion baked into vertex colour: the cheapest big look upgrade for a vertex-coloured
// asset — creases, wheel wells and the gap under a turret darken, as a lit render would. Each
// vertex fires a fixed cosine-weighted hemisphere of rays (Fibonacci spiral, no randomness) at the
// asset's own triangles (and optionally the ground plane); the hit fraction darkens its colour.

import { type CompiledAsset, type Mesh, merge, type Vec3, worldMeshes } from '../core/index.ts';
import { RayGrid } from './ray-grid.ts';

export interface AoOptions {
  /** Rays per vertex. Default 24. */
  readonly samples?: number;
  /** Occluders farther than this (metres) don't count. Default 1. */
  readonly radius?: number;
  /** 0 = no change, 1 = fully occluded vertices go black. Default 0.6. */
  readonly strength?: number;
  /** Treat z = 0 as a ground plane (contact shadow under the asset). Default true. */
  readonly ground?: boolean;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** Fixed cosine-weighted directions around +Z. */
function hemisphere(n: number): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / n);
    const phi = i * GOLDEN;
    return [r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - r * r))] as Vec3;
  });
}

/** Orthonormal frame with `n` as its Z (Frisvad / Duff et al. branchless basis). */
function frame(n: Vec3): [Vec3, Vec3] {
  const s = n[2] >= 0 ? 1 : -1;
  const a = -1 / (s + n[2]);
  const b = n[0] * n[1] * a;
  return [
    [1 + s * n[0] * n[0] * a, s * b, -s * n[0]],
    [b, s + n[1] * n[1] * a, -n[1]],
  ];
}

/**
 * Vertices sharing a position (0.1 mm) and normal (0.001) share one result: welded seams and
 * duplicated soup vertices cost one hemisphere, not many. Open addressing on the six integers.
 */
class Memo {
  private readonly keys: Float64Array;
  private readonly vals: Float64Array;
  private readonly used: Uint8Array;
  private readonly mask: number;

  constructor(n: number) {
    let cap = 16;
    while (cap < n * 2) cap *= 2;
    this.mask = cap - 1;
    this.keys = new Float64Array(cap * 6);
    this.vals = new Float64Array(cap);
    this.used = new Uint8Array(cap);
  }

  /** Slot for the key; `found` tells whether it already holds a value. */
  slot(k: Float64Array): { at: number; found: boolean } {
    let h = 2166136261;
    for (let i = 0; i < 6; i++) h = Math.imul(h ^ ((k[i] ?? 0) | 0), 16777619);
    let at = (h >>> 0) & this.mask;
    for (;;) {
      if (!this.used[at]) return { at, found: false };
      let same = true;
      for (let i = 0; i < 6 && same; i++) same = this.keys[at * 6 + i] === k[i];
      if (same) return { at, found: true };
      at = (at + 1) & this.mask;
    }
  }

  get(at: number): number {
    return this.vals[at] ?? 0;
  }

  set(at: number, k: Float64Array, v: number): void {
    this.used[at] = 1;
    this.keys.set(k, at * 6);
    this.vals[at] = v;
  }
}

/** Per-vertex visibility (1 = open sky, 0 = buried) of `mesh` against `grid`. */
function visibility(mesh: Mesh, grid: RayGrid, o: AoOptions): Float32Array {
  const hemi = hemisphere(o.samples ?? 24);
  const D = Float64Array.from(hemi.flat());
  const count = hemi.length;
  const radius = o.radius ?? 1;
  const ground = o.ground ?? true;
  const P = mesh.positions;
  const N = mesh.normals;
  const out = new Float32Array(P.length / 3);
  const memo = new Memo(out.length);
  const key = new Float64Array(6);
  // Lift off the surface so a ray never hits the face it starts on.
  const bias = 2e-3;
  for (let v = 0; v < out.length; v++) {
    const px = P[v * 3] ?? 0;
    const py = P[v * 3 + 1] ?? 0;
    const pz = P[v * 3 + 2] ?? 0;
    const rx = N[v * 3] ?? 0;
    const ry = N[v * 3 + 1] ?? 0;
    const rz = N[v * 3 + 2] ?? 1;
    const len = Math.hypot(rx, ry, rz) || 1;
    const n: Vec3 = [rx / len, ry / len, rz / len];
    key[0] = Math.round(px * 1e4);
    key[1] = Math.round(py * 1e4);
    key[2] = Math.round(pz * 1e4);
    key[3] = Math.round(n[0] * 1e3);
    key[4] = Math.round(n[1] * 1e3);
    key[5] = Math.round(n[2] * 1e3);
    const s = memo.slot(key);
    if (s.found) {
      out[v] = memo.get(s.at);
      continue;
    }
    const [t, b] = frame(n);
    const ox = px + n[0] * bias;
    const oy = py + n[1] * bias;
    const oz = pz + n[2] * bias;
    let blocked = 0;
    for (let i = 0; i < count; i++) {
      const d0 = D[i * 3] ?? 0;
      const d1 = D[i * 3 + 1] ?? 0;
      const d2 = D[i * 3 + 2] ?? 0;
      const wx = t[0] * d0 + b[0] * d1 + n[0] * d2;
      const wy = t[1] * d0 + b[1] * d1 + n[1] * d2;
      const wz = t[2] * d0 + b[2] * d1 + n[2] * d2;
      if (ground && wz < -1e-6 && oz >= 0 && -oz / wz <= radius) blocked++;
      else if (grid.hit(ox, oy, oz, wx, wy, wz, radius)) blocked++;
    }
    const vis = 1 - blocked / count;
    memo.set(s.at, key, vis);
    out[v] = vis;
  }
  return out;
}

const darken = (mesh: Mesh, vis: Float32Array, strength: number): Mesh => {
  const colors = new Float32Array(mesh.colors);
  for (let v = 0; v < vis.length; v++) {
    const f = 1 - strength * (1 - (vis[v] ?? 1));
    for (let k = 0; k < 3; k++) colors[v * 3 + k] = (colors[v * 3 + k] ?? 0) * f;
  }
  return { ...mesh, colors };
};

/** Bake AO of one mesh against itself (or `occluder`, in the same space). */
// Callers bake several parts against one occluder (a head's skin, jaw and eyes against the
// whole head): index each occluder once. Meshes are immutable, so the grid stays valid.
const grids = new WeakMap<Mesh, RayGrid>();
const gridOf = (m: Mesh): RayGrid => {
  const hit = grids.get(m);
  if (hit) return hit;
  const g = new RayGrid(m);
  grids.set(m, g);
  return g;
};

export function bakeAo(mesh: Mesh, o: AoOptions = {}, occluder: Mesh = mesh): Mesh {
  return darken(mesh, visibility(mesh, gridOf(occluder), o), o.strength ?? 0.6);
}

/**
 * Bake AO across a whole compiled asset: every part is occluded by every other (a wheel darkens
 * the hull behind it). Colours only change, so parts keep their local meshes and pivots.
 */
export function bakeAoAsset(asset: CompiledAsset, o: AoOptions = {}): CompiledAsset {
  const world = worldMeshes(asset.parts);
  if (world.size === 0) return asset;
  const grid = new RayGrid(merge([...world.values()]));
  const strength = o.strength ?? 0.6;
  return {
    ...asset,
    parts: asset.parts.map((p) => {
      const w = world.get(p.name);
      return p.mesh && w ? { ...p, mesh: darken(p.mesh, visibility(w, grid, o), strength) } : p;
    }),
  };
}
