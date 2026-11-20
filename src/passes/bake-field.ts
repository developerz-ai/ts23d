// Field maps baked per vertex, measured from the geometry that made the mesh rather than guessed
// from colour: mean curvature (finite-difference Laplacian of the SDF at one cell: ½∇²f = H),
// cavity (clamp(−H·reach) blurred over the welded vertex graph), thickness (inward sphere trace
// to the far side, ÷ reach) and AO (bake-ao's hemisphere rays). Meshes without a field fall back
// to the mesh itself: edge-normal curvature and RayGrid rays. Deterministic: fixed stencils,
// fixed sweep order, no randomness.

import { dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { type AoOptions, bakeAo } from './bake-ao.ts';
import { RayGrid } from './ray-grid.ts';

/** Signed distance (metres, negative inside) — the same shape as primitives' `Field`. */
export type DistanceField = (p: Vec3) => number;

export type FieldMap = 'curvature' | 'cavity' | 'thickness' | 'ao';

export interface FieldBakeOptions {
  /** Which maps to bake. Default all four. */
  readonly maps?: readonly FieldMap[];
  /** Finite-difference step, metres (≈ one meshing cell). Default 2 % of the mesh's largest side. */
  readonly cell?: number;
  /** Fold size, metres: cavity = clamp(−H·reach), thickness = depth ÷ reach. Default 8 cells. */
  readonly reach?: number;
  /** Jacobi blur sweeps for cavity over the vertex graph. Default 2. */
  readonly smooth?: number;
  readonly ao?: AoOptions;
}

/** Per-vertex channels (one float per vertex); only the requested maps are present. */
export interface FieldMaps {
  /** Mean curvature H, 1/metres: + convex (1/r on a sphere), − concave. */
  readonly curvature?: Float32Array;
  /** 0..1: 0 open, 1 a fold `reach` wide. */
  readonly cavity?: Float32Array;
  /** 0..1: distance through the solid along −n ÷ reach (1 = at least `reach` thick). */
  readonly thickness?: Float32Array;
  /** 0..1 visibility: 1 open sky, 0 buried. */
  readonly ao?: Float32Array;
}

/** Pointwise probes of a field, for colour callbacks that run while the mesh is being made. */
export interface FieldProbe {
  /** Mean curvature H at p (1/m). */
  curvature(p: Vec3): number;
  /** Metres through the solid from surface point p along −n (capped at `cap`). */
  depth(p: Vec3, n: Vec3, cap: number): number;
}

export function fieldProbe(field: DistanceField, cell: number): FieldProbe {
  if (!(Number.isFinite(cell) && cell > 0))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `fieldProbe cell is ${cell} m`,
      fix: 'pass the meshing cell size in metres (> 0), e.g. the sculpt res',
    });
  const h = cell;
  return {
    curvature: ([x, y, z]) => {
      const lap =
        field([x + h, y, z]) +
        field([x - h, y, z]) +
        field([x, y + h, z]) +
        field([x, y - h, z]) +
        field([x, y, z + h]) +
        field([x, y, z - h]) -
        6 * field([x, y, z]);
      return lap / (2 * h * h);
    },
    depth: (p, n, cap) => {
      // Sphere-trace inward: inside, |f| is the distance to the nearest surface, so a step of
      // |f| never jumps the far side; a floor of ¼ cell gets off the start surface.
      let t = h * 0.5;
      while (t < cap) {
        const f = field([p[0] - n[0] * t, p[1] - n[1] * t, p[2] - n[2] * t]);
        if (f > 0) return t;
        t += Math.max(-f, h * 0.25);
      }
      return cap;
    },
  };
}

const at3 = (a: ArrayLike<number>, i: number): Vec3 => [
  a[i * 3] ?? 0,
  a[i * 3 + 1] ?? 0,
  a[i * 3 + 2] ?? 0,
];

/** Welded neighbours per vertex (vertices sharing a position to 1 µm are one node). */
function neighbours(m: Mesh): { node: Int32Array; adj: number[][] } {
  const n = m.positions.length / 3;
  const node = new Int32Array(n);
  const key = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const p = at3(m.positions, i);
    const k = `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)},${Math.round(p[2] * 1e6)}`;
    const id = key.get(k) ?? key.size;
    if (id === key.size) key.set(k, id);
    node[i] = id;
  }
  const sets = Array.from({ length: key.size }, () => new Set<number>());
  for (let t = 0; t < m.indices.length; t += 3)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        const va = node[m.indices[t + a] ?? 0] ?? 0;
        const vb = node[m.indices[t + b] ?? 0] ?? 0;
        if (va !== vb) sets[va]?.add(vb);
      }
  return { node, adj: sets.map((s) => [...s].sort((x, y) => x - y)) };
}

const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Mesh-only mean curvature: mean over welded edges of 2 n·(p − q) / |p − q|² (1/r on a sphere). */
function meshCurvature(m: Mesh, node: Int32Array, adj: number[][]): Float64Array {
  const nodes = adj.length;
  const pos = new Float64Array(nodes * 3);
  const nrm = new Float64Array(nodes * 3);
  for (let i = 0; i < node.length; i++) {
    const g = node[i] ?? 0;
    for (let k = 0; k < 3; k++) {
      pos[g * 3 + k] = m.positions[i * 3 + k] ?? 0;
      nrm[g * 3 + k] = (nrm[g * 3 + k] ?? 0) + (m.normals[i * 3 + k] ?? 0);
    }
  }
  const out = new Float64Array(nodes);
  for (let g = 0; g < nodes; g++) {
    const p = at3(pos, g);
    const n = unit(at3(nrm, g));
    let s = 0;
    for (const j of adj[g] ?? []) {
      const q = at3(pos, j);
      const d: Vec3 = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
      s +=
        (2 * (n[0] * d[0] + n[1] * d[1] + n[2] * d[2])) /
        (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1);
    }
    out[g] = (adj[g]?.length ?? 0) > 0 ? s / (adj[g]?.length ?? 1) : 0;
  }
  return out;
}

/** Distance along the ray to the first hit, by bisection on RayGrid's any-hit query. */
function rayDepth(grid: RayGrid, o: Vec3, d: Vec3, cap: number): number {
  if (!grid.hit(o[0], o[1], o[2], d[0], d[1], d[2], cap)) return cap;
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (grid.hit(o[0], o[1], o[2], d[0], d[1], d[2], mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

function defaultCell(m: Mesh): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of m.positions) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return Number.isFinite(hi - lo) && hi > lo ? (hi - lo) * 0.02 : 0.01;
}

/** Bake the requested maps for every vertex of `mesh`; `field` null = mesh-only fallback. */
export function bakeField(
  mesh: Mesh,
  field: DistanceField | null,
  o: FieldBakeOptions = {},
): FieldMaps {
  const maps = new Set(o.maps ?? ['curvature', 'cavity', 'thickness', 'ao']);
  const cell = o.cell ?? defaultCell(mesh);
  const reach = o.reach ?? cell * 8;
  const smooth = o.smooth ?? 2;
  if (!(reach > 0 && Number.isInteger(smooth) && smooth >= 0))
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `bakeField reach ${reach} m, smooth ${smooth}`,
      fix: 'reach is a fold size in metres (> 0); smooth is a whole number of sweeps ≥ 0',
    });
  const nv = mesh.positions.length / 3;
  const { node, adj } = neighbours(mesh);
  const probe = field ? fieldProbe(field, cell) : null;
  const out: { -readonly [K in FieldMap]?: Float32Array } = {};
  let H: Float64Array | null = null;
  if (maps.has('curvature') || maps.has('cavity')) {
    if (probe) {
      H = new Float64Array(adj.length);
      for (let i = 0; i < nv; i++) H[node[i] ?? 0] = probe.curvature(at3(mesh.positions, i));
    } else H = meshCurvature(mesh, node, adj);
  }
  const perVertex = (g: ArrayLike<number>): Float32Array =>
    Float32Array.from({ length: nv }, (_, i) => g[node[i] ?? 0] ?? 0);
  if (H && maps.has('curvature')) out.curvature = perVertex(H);
  if (H && maps.has('cavity')) {
    let cav = H.map((h) => Math.min(1, Math.max(0, -h * reach)));
    for (let s = 0; s < smooth; s++)
      cav = cav.map((c, g) => {
        const nb = adj[g] ?? [];
        let sum = c;
        for (const j of nb) sum += cav[j] ?? 0;
        return sum / (nb.length + 1);
      });
    out.cavity = perVertex(cav);
  }
  if (maps.has('thickness')) {
    const grid = probe ? null : new RayGrid(mesh);
    out.thickness = Float32Array.from({ length: nv }, (_, i) => {
      const p = at3(mesh.positions, i);
      const n = unit(at3(mesh.normals, i));
      const back: Vec3 = [-n[0], -n[1], -n[2]];
      const lift: Vec3 = [p[0] - n[0] * 1e-4, p[1] - n[1] * 1e-4, p[2] - n[2] * 1e-4];
      const d = probe ? probe.depth(p, n, reach) : grid ? rayDepth(grid, lift, back, reach) : reach;
      return Math.min(1, d / reach);
    });
  }
  if (maps.has('ao')) {
    const white = { ...mesh, colors: new Float32Array(nv * 3).fill(1) };
    const lit = bakeAo(white, { ...o.ao, strength: 1 });
    out.ao = Float32Array.from({ length: nv }, (_, i) => lit.colors[i * 3] ?? 1);
  }
  return out;
}
