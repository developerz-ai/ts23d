// Gates: surfaces a viewer either can't see or can't see cleanly. `zFighting` — a face lying in
// another part's face, both facing the same way, flickers in every engine. `hiddenParts` — a part
// entirely inside another closed solid is budget nobody ever sees. Both need a closed partner
// (point-in-solid); open sheets are skipped, never guessed.

import {
  type Bounds,
  type CompiledAsset,
  type Mesh,
  type Vec3,
  worldMeshes,
} from '../core/index.ts';
import type { TriangleGrid } from './geometry.ts';
import { meshBounds, solidIndex, triangleGrid } from './geometry-cache.ts';
import type { SolidIndex } from './inside.ts';
import type { Finding, Gate } from './types.ts';

const overlaps = (a: Bounds, b: Bounds, eps: number): boolean =>
  [0, 1, 2].every(
    (k) => (a.min[k] ?? 0) <= (b.max[k] ?? 0) + eps && (b.min[k] ?? 0) <= (a.max[k] ?? 0) + eps,
  );
const contains = (outer: Bounds, inner: Bounds): boolean =>
  [0, 1, 2].every(
    (k) => (outer.min[k] ?? 0) <= (inner.min[k] ?? 0) && (inner.max[k] ?? 0) <= (outer.max[k] ?? 0),
  );

/** Up to `cap` triangle centroids with unit face normals, evenly strided (deterministic). */
function faceSamples(m: Mesh, cap: number): Array<{ p: Vec3; n: Vec3 }> {
  const tris = m.indices.length / 3;
  const step = Math.max(1, Math.floor(tris / cap));
  const out: Array<{ p: Vec3; n: Vec3 }> = [];
  const P = m.positions;
  const v = (i: number): Vec3 => [P[i * 3] ?? 0, P[i * 3 + 1] ?? 0, P[i * 3 + 2] ?? 0];
  for (let t = 0; t < tris; t += step) {
    const a = v(m.indices[t * 3] ?? 0);
    const b = v(m.indices[t * 3 + 1] ?? 0);
    const c = v(m.indices[t * 3 + 2] ?? 0);
    const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const g: Vec3 = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    const len = Math.hypot(...g);
    if (len < 1e-10) continue;
    out.push({
      p: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      n: [g[0] / len, g[1] / len, g[2] / len],
    });
  }
  return out;
}

interface Scene {
  readonly names: string[];
  readonly mesh: Map<string, Mesh>;
  readonly bounds: Map<string, Bounds>;
  grid(name: string): TriangleGrid;
  solid(name: string): SolidIndex;
}

function scene(asset: CompiledAsset): Scene {
  const mesh = worldMeshes(asset.parts);
  const bounds = new Map([...mesh].map(([n, m]) => [n, meshBounds(m)]));
  const grids = new Map<string, TriangleGrid>();
  const solids = new Map<string, SolidIndex>();
  const lazy =
    <T>(cache: Map<string, T>, make: (m: Mesh) => T) =>
    (name: string): T => {
      const hit = cache.get(name);
      if (hit) return hit;
      const made = make(
        mesh.get(name) ?? {
          positions: new Float32Array(),
          normals: new Float32Array(),
          uvs: new Float32Array(),
          colors: new Float32Array(),
          indices: new Uint32Array(),
        },
      );
      cache.set(name, made);
      return made;
    };
  return {
    names: [...mesh.keys()],
    mesh,
    bounds,
    grid: lazy(grids, triangleGrid),
    solid: lazy(solids, solidIndex),
  };
}

const ON = 2e-4;
const PROBE = 2e-3;

export const zFighting: Gate = (asset) => {
  const s = scene(asset);
  const out: Finding[] = [];
  for (const a of s.names) {
    const ba = s.bounds.get(a);
    const ma = s.mesh.get(a);
    if (!ba || !ma) continue;
    const samples = faceSamples(ma, 256);
    for (const b of s.names) {
      const bb = s.bounds.get(b);
      if (a === b || !bb || !overlaps(ba, bb, ON)) continue;
      let hits = 0;
      for (const { p, n } of samples) {
        if (!overlaps({ min: p, max: p }, bb, ON) || s.grid(b).nearest(p, ON) > ON) continue;
        const solid = s.solid(b);
        const behind = solid.inside([
          p[0] - n[0] * PROBE,
          p[1] - n[1] * PROBE,
          p[2] - n[2] * PROBE,
        ]);
        const front = solid.inside([p[0] + n[0] * PROBE, p[1] + n[1] * PROBE, p[2] + n[2] * PROBE]);
        if (behind && !front) hits++;
      }
      if (hits >= 2)
        out.push({
          gate: 'z-fighting',
          part: a,
          message: `'${a}' has ${hits} face sample(s) lying in '${b}''s surface, facing the same way — it flickers`,
          fix: `stand '${a}' proud of '${b}' by ≥ 2 mm, or inset it, or cut it from '${b}'; coplanar faces never render cleanly`,
        });
    }
  }
  return out;
};

export const hiddenParts: Gate = (asset) => {
  const s = scene(asset);
  return s.names.flatMap((a): Finding[] => {
    const ba = s.bounds.get(a);
    const ma = s.mesh.get(a);
    if (!ba || !ma) return [];
    const pts = faceSamples(ma, 64).map((x) => x.p);
    const stride = Math.max(1, Math.floor(ma.positions.length / 192));
    for (let i = 0; i < ma.positions.length / 3; i += stride)
      pts.push([
        ma.positions[i * 3] ?? 0,
        ma.positions[i * 3 + 1] ?? 0,
        ma.positions[i * 3 + 2] ?? 0,
      ]);
    const host = s.names.find((b) => {
      const bb = s.bounds.get(b);
      if (b === a || !bb || !contains(bb, ba)) return false;
      // Inside, and not merely flush with the host's skin (that is seating, not hiding).
      return (
        pts.every((p) => s.solid(b).inside(p)) &&
        pts.every((p) => s.grid(b).nearest(p, PROBE) > PROBE)
      );
    });
    return host
      ? [
          {
            gate: 'hidden-parts',
            part: a,
            message: `'${a}' (${ma.indices.length / 3} tris) is entirely inside '${host}' — nobody can see it`,
            fix: `delete it, gate it behind ctx.lod, or move it out of '${host}'; hidden triangles are wasted budget`,
          },
        ]
      : [];
  });
};
