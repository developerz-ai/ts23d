// QA for strand cards. `furSilhouette`: in each declared zone the coated outline must be rougher
// than the bare one — orthographic masks of the parent alone and parent + cards from five axis
// views, outline length (mask transitions) inside the zone's disc; coated ÷ bare below `min` in
// every view where the zone is on the outline fails T3D_FUR_SILHOUETTE (velvet, not fur).
// `cardRootProof`: every card's buried root (vertices 0/1 of each strip) lies inside the parent
// solid — the proof floating-parts / gaps may accept instead of a contact, never a name.

import {
  type Check,
  type CheckFinding,
  type CompiledAsset,
  type Mesh,
  toWorld,
  type Vec3,
  worldTransforms,
} from '../core/index.ts';
import { SolidIndex } from './inside.ts';
import type { Finding } from './types.ts';

/** A region whose outline the coat must break. `at` is world space, on the parent's surface. */
export interface FurSilhouetteZone {
  readonly name: string;
  /** Card part and the part it grows from. */
  readonly coat: string;
  readonly on: string;
  readonly at: Vec3;
  readonly radius: number;
  /** Coated ÷ bare outline length needed (default 1.5). */
  readonly min?: number;
}

const VIEWS: readonly Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [Math.SQRT1_2, Math.SQRT1_2, 0],
  [Math.SQRT1_2, -Math.SQRT1_2, 0],
];
const N = 160;

function basis(d: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  const u: Vec3 = [a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0]];
  const l = Math.hypot(u[0], u[1], u[2]);
  const un: Vec3 = [u[0] / l, u[1] / l, u[2] / l];
  return [
    un,
    [d[1] * un[2] - d[2] * un[1], d[2] * un[0] - d[0] * un[2], d[0] * un[1] - d[1] * un[0]],
  ];
}

/** Fill the triangles of world-space `tris` (9 floats each) into an N×N mask around `c`. */
function raster(mask: Uint8Array, tris: Float64Array, c: Vec3, half: number, d: Vec3): void {
  const [u, v] = basis(d);
  const px = (p: number, k: number): number =>
    ((p -
      (k === 0
        ? c[0] * u[0] + c[1] * u[1] + c[2] * u[2]
        : c[0] * v[0] + c[1] * v[1] + c[2] * v[2])) /
      half +
      1) *
    (N / 2);
  for (let t = 0; t < tris.length; t += 9) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let k = 0; k < 3; k++) {
      const p: Vec3 = [tris[t + k * 3] ?? 0, tris[t + k * 3 + 1] ?? 0, tris[t + k * 3 + 2] ?? 0];
      xs.push(px(p[0] * u[0] + p[1] * u[1] + p[2] * u[2], 0));
      ys.push(px(p[0] * v[0] + p[1] * v[1] + p[2] * v[2], 1));
    }
    const [x0, x1, x2] = [xs[0] ?? 0, xs[1] ?? 0, xs[2] ?? 0];
    const [y0, y1, y2] = [ys[0] ?? 0, ys[1] ?? 0, ys[2] ?? 0];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;
    const lx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const hx = Math.min(N - 1, Math.ceil(Math.max(x0, x1, x2)));
    const ly = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const hy = Math.min(N - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = ly; y <= hy; y++)
      for (let x = lx; x <= hx; x++) {
        const sx = x + 0.5;
        const sy = y + 0.5;
        const w0 = ((x1 - sx) * (y2 - sy) - (x2 - sx) * (y1 - sy)) / area;
        const w1 = ((x2 - sx) * (y0 - sy) - (x0 - sx) * (y2 - sy)) / area;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) mask[y * N + x] = 1;
      }
  }
}

/** Mask transitions (4-neighbour) inside the disc of radius N/2 · 1/1.3: the outline length. */
function outline(mask: Uint8Array): number {
  let n = 0;
  const r = N / 2 / 1.3;
  for (let y = 0; y < N - 1; y++)
    for (let x = 0; x < N - 1; x++) {
      if (Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) > r) continue;
      const m = mask[y * N + x] ?? 0;
      if (m !== (mask[y * N + x + 1] ?? 0)) n++;
      if (m !== (mask[(y + 1) * N + x] ?? 0)) n++;
    }
  return n;
}

function worldTris(
  asset: CompiledAsset,
  name: string,
  c: Vec3,
  reach: number,
): Float64Array | null {
  const part = asset.parts.find((p) => p.name === name);
  const t = worldTransforms(asset.parts).get(name);
  const m = part?.mesh;
  if (!m || !t) return null;
  const out: number[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const ps = [0, 1, 2].map((k) => {
      const v = m.indices[i + k] ?? 0;
      return toWorld(t, [
        m.positions[v * 3] ?? 0,
        m.positions[v * 3 + 1] ?? 0,
        m.positions[v * 3 + 2] ?? 0,
      ]);
    });
    if (ps.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > reach)) continue;
    for (const p of ps) out.push(p[0], p[1], p[2]);
  }
  return new Float64Array(out);
}

/** Findings for every zone whose coat leaves the outline smooth (or that sits off the outline). */
export function furSilhouette(
  asset: CompiledAsset,
  zones: readonly FurSilhouetteZone[],
): Finding[] {
  if (asset.lod === 2) return [];
  const out: Finding[] = [];
  const fail = (z: FurSilhouetteZone, message: string, fix: string): void => {
    out.push({
      gate: 'fur-silhouette',
      code: 'T3D_FUR_SILHOUETTE',
      part: z.coat,
      message: `T3D_FUR_SILHOUETTE zone '${z.name}': ${message}`,
      fix,
    });
  };
  for (const z of zones) {
    const half = z.radius * 1.3;
    const reach = half * 2;
    const bare = worldTris(asset, z.on, z.at, reach);
    if (!bare) {
      fail(
        z,
        `part '${z.on}' has no mesh`,
        `declare the zone on the body part the coat grows from`,
      );
      continue;
    }
    const coat = worldTris(asset, z.coat, z.at, reach) ?? new Float64Array(0);
    let best = 0;
    for (const d of VIEWS) {
      const a = new Uint8Array(N * N);
      raster(a, bare, z.at, half, d);
      const lb = outline(a);
      if (lb < N * 0.3) continue;
      raster(a, coat, z.at, half, d);
      best = Math.max(best, outline(a) / lb);
    }
    const min = z.min ?? 1.5;
    if (best === 0)
      fail(
        z,
        'the zone is not on the outline in any axis view',
        'centre the zone on the body surface where it shows against the sky (back, chest, tail)',
      );
    else if (best < min)
      fail(
        z,
        `outline ${best.toFixed(2)}× the bare body's, needs ${min}×`,
        'lengthen or lift the guard-hair cards in this zone so they cross the outline (more lift, less bend, longer cards)',
      );
  }
  return out;
}

/** The same test as a recipe `check` (definition `checks: [furSilhouetteCheck(zones)]`). */
export const furSilhouetteCheck =
  (zones: readonly FurSilhouetteZone[]): Check =>
  (asset): readonly CheckFinding[] =>
    furSilhouette(asset, zones).map((f) => ({
      ...(f.part ? { part: f.part } : {}),
      message: f.message,
      fix: f.fix,
    }));

/** The buried root of every card in a card mesh: the midpoint of each strip's first two vertices. */
export function cardRoots(m: Mesh): Vec3[] {
  const n = m.positions.length / 3;
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    parent[i] = r;
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = find(m.indices[t] ?? 0);
    for (let k = 1; k < 3; k++) {
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const P = m.positions;
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++)
    if (find(i) === i && P.length >= (i + 2) * 3)
      out.push([
        ((P[i * 3] ?? 0) + (P[i * 3 + 3] ?? 0)) / 2,
        ((P[i * 3 + 1] ?? 0) + (P[i * 3 + 4] ?? 0)) / 2,
        ((P[i * 3 + 2] ?? 0) + (P[i * 3 + 5] ?? 0)) / 2,
      ]);
  return out;
}

/** Card roots (same frame as `parent`) and those outside the parent solid: [] is the proof. */
export function cardRootProof(cards: Mesh, parent: Mesh): { roots: number; outside: Vec3[] } {
  const roots = cardRoots(cards);
  const solid = new SolidIndex(parent);
  return { roots: roots.length, outside: roots.filter((r) => !solid.inside(r)) };
}
