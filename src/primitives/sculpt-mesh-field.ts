// A mesh (a model's surface, a scan) as a sculpt field. The mesh is moved by a similarity fit
// (similarity-fit.ts: onto the code skeleton), then sampled on a brick grid: unsigned distance by
// rasterising each triangle's narrow band (BVH-free, exact point–triangle), the sign from the
// generalised winding number (mesh-bvh.ts; robust to the holes and flipped patches models
// return) — per point inside the band, per connected region beyond it — then clamped to ±band,
// Lipschitz-clamped along every axis (|Δd| ≤ one cell, so trilinear reads stay a distance bound)
// and quantised to int16. `meshField` is the brick as an ordinary sculpt field edit; `meshDetail`
// is its high-pass as a surface relief: what the model adds at a scale below `sigma`, faded out
// where the model's surface strays from the code's (code owns the anatomy, the model the skin).

import type { Mesh, Vec3 } from '../core/index.ts';
import { invalid } from './check.ts';
import { triBvh } from './mesh-bvh.ts';
import type { SculptFieldEdit } from './sculpt-edit.ts';
import { signs, unsignedBand } from './sculpt-mesh-band.ts';
import type { BlendKernel, Field } from './sdf-ops.ts';
import { applySimilarity, IDENTITY, type Similarity } from './similarity-fit.ts';

export interface MeshFieldOptions {
  /** Brick cell edge, metres, in the fitted frame. */
  readonly cell: number;
  /** Source → target similarity (fitToField / similarityFit). Default identity. */
  readonly fit?: Similarity;
  /** Distances clamp to ±band (default 4 cells): the band the sign and detail are exact in. */
  readonly band?: number;
  /** Refuse bricks above this many points (default 2^24). */
  readonly maxPoints?: number;
}

export interface MeshBrick {
  /** Trilinear signed distance (negative inside), ±band past the band; box distance off-grid. */
  readonly field: Field;
  readonly bounds: readonly [Vec3, Vec3];
  readonly cell: number;
  readonly band: number;
  readonly dims: readonly [number, number, number];
  /** Quantised samples, x fastest: value · band / 32767. */
  readonly samples: Int16Array;
}

const Q = 32767;
const memo = new WeakMap<Mesh, Map<string, MeshBrick>>();

export function meshBrick(mesh: Mesh, o: MeshFieldOptions): MeshBrick {
  const key = JSON.stringify([o.cell, o.band, o.fit, o.maxPoints]);
  const seen = memo.get(mesh)?.get(key);
  if (seen) return seen;
  const b = buildBrick(mesh, o);
  memo.set(mesh, (memo.get(mesh) ?? new Map()).set(key, b));
  return b;
}

function buildBrick(mesh: Mesh, o: MeshFieldOptions): MeshBrick {
  const cell = o.cell;
  if (!(cell > 0 && Number.isFinite(cell)))
    invalid(`mesh field: cell is ${cell}`, 'give the brick cell in metres, e.g. 0.004');
  const band = o.band ?? cell * 4;
  if (!(band >= cell * 1.5))
    invalid(
      `mesh field: band ${band} is under 1.5 cells`,
      'use band ≥ 1.5 × cell (default 4 cells)',
    );
  const fit = o.fit ?? IDENTITY;
  const P = mesh.positions;
  const moved = new Float32Array(P.length);
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    const q = applySimilarity(fit, [P[i] ?? 0, P[i + 1] ?? 0, P[i + 2] ?? 0]);
    for (let a = 0; a < 3; a++) {
      moved[i + a] = q[a] ?? 0;
      lo[a] = Math.min(lo[a] ?? 0, q[a] ?? 0);
      hi[a] = Math.max(hi[a] ?? 0, q[a] ?? 0);
    }
  }
  const fitted: Mesh = { ...mesh, positions: moved };
  const pad = band + cell;
  const org: Vec3 = [lo[0] - pad, lo[1] - pad, lo[2] - pad];
  const dims = [0, 1, 2].map(
    (a) => Math.ceil(((hi[a] ?? 0) - (lo[a] ?? 0) + 2 * pad) / cell) + 1,
  ) as [number, number, number];
  const [nx, ny, nz] = dims;
  const total = nx * ny * nz;
  if (!(total <= (o.maxPoints ?? 2 ** 24)))
    invalid(
      `mesh field: ${nx}×${ny}×${nz} = ${total} brick points`,
      'raise cell (coarser brick) or fit the mesh smaller',
    );
  const at = (i: number, j: number, k: number): Vec3 => [
    org[0] + i * cell,
    org[1] + j * cell,
    org[2] + k * cell,
  ];
  const dist = unsignedBand(moved, mesh.indices, org, dims, cell, band);
  const sign = signs(triBvh(fitted), dist, org, dims, cell);
  const d = new Float32Array(total);
  for (let id = 0; id < total; id++) d[id] = (sign[id] ?? 1) * (dist[id] ?? band);
  lipschitzClamp(d, dims, cell);
  const samples = new Int16Array(total);
  for (let id = 0; id < total; id++)
    samples[id] = Math.round((Math.max(-band, Math.min(band, d[id] ?? 0)) / band) * Q);
  const bounds: [Vec3, Vec3] = [org, at(nx - 1, ny - 1, nz - 1)];
  return { field: trilinear(samples, dims, org, cell, band), bounds, cell, band, dims, samples };
}

/** |d[i] − d[i ± 1]| ≤ cell along every axis: forward and backward sweeps, twice. */
function lipschitzClamp(d: Float32Array, dims: readonly number[], cell: number): void {
  const [nx = 1, ny = 1] = dims;
  const strides = [1, nx, nx * ny];
  for (let pass = 0; pass < 2; pass++)
    for (let a = 0; a < 3; a++) {
      const st = strides[a] ?? 1;
      const n = dims[a] ?? 1;
      for (let id = 0; id < d.length; id++) {
        const c = Math.floor(id / st) % n;
        if (c === 0) continue;
        const prev = d[id - st] ?? 0;
        d[id] = Math.max(prev - cell, Math.min(prev + cell, d[id] ?? 0));
      }
      for (let id = d.length - 1; id >= 0; id--) {
        const c = Math.floor(id / st) % n;
        if (c === n - 1) continue;
        const next = d[id + st] ?? 0;
        d[id] = Math.max(next - cell, Math.min(next + cell, d[id] ?? 0));
      }
    }
}

/** Trilinear read of a quantised brick; off-grid: band + the distance to the grid box. */
export function trilinear(
  s: Int16Array | Float32Array,
  dims: readonly [number, number, number],
  org: Vec3,
  cell: number,
  scale: number,
): Field {
  const [nx, ny, nz] = dims;
  const k = s instanceof Int16Array ? scale / Q : 1;
  return (p) => {
    const fx = (p[0] - org[0]) / cell;
    const fy = (p[1] - org[1]) / cell;
    const fz = (p[2] - org[2]) / cell;
    const ox = Math.max(0, -fx, fx - (nx - 1));
    const oy = Math.max(0, -fy, fy - (ny - 1));
    const oz = Math.max(0, -fz, fz - (nz - 1));
    if (ox + oy + oz > 0) return scale + cell * Math.hypot(ox, oy, oz);
    const i = Math.min(nx - 2, Math.floor(fx));
    const j = Math.min(ny - 2, Math.floor(fy));
    const l = Math.min(nz - 2, Math.floor(fz));
    const u = fx - i;
    const v = fy - j;
    const w = fz - l;
    const id = i + nx * (j + ny * l);
    const g = (o: number): number => s[id + o] ?? 0;
    const sx = nx * ny;
    const c00 = g(0) + (g(1) - g(0)) * u;
    const c10 = g(nx) + (g(nx + 1) - g(nx)) * u;
    const c01 = g(sx) + (g(sx + 1) - g(sx)) * u;
    const c11 = g(sx + nx) + (g(sx + nx + 1) - g(sx + nx)) * u;
    const c0 = c00 + (c10 - c00) * v;
    const c1 = c01 + (c11 - c01) * v;
    return (c0 + (c1 - c0) * w) * k;
  };
}

export interface MeshFieldEditOptions extends MeshFieldOptions {
  readonly op?: 'add' | 'subtract' | 'intersect' | 'paint';
  readonly blend?: number;
  readonly kernel?: BlendKernel;
  readonly color?: Vec3;
  readonly mirror?: boolean;
}

/** The mesh as one sculpt edit: `sculpt({ edits: [...code, meshField(surf, { cell, fit })] })`. */
export function meshField(mesh: Mesh, o: MeshFieldEditOptions): SculptFieldEdit {
  const b = meshBrick(mesh, o);
  return {
    field: b.field,
    bounds: b.bounds,
    ...(o.op ? { op: o.op } : {}),
    ...(o.blend !== undefined ? { blend: o.blend } : {}),
    ...(o.kernel ? { kernel: o.kernel } : {}),
    ...(o.color ? { color: o.color } : {}),
    ...(o.mirror !== undefined ? { mirror: o.mirror } : {}),
  };
}
