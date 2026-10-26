// Livery: paint a finished mesh by rules instead of by hand. Base colour, then ordered rules —
// the last matching rule wins — keyed on height bands, an along-length range, a side-elevation
// polygon (stripes, wings, numbers' backgrounds), and surface orientation (roof, front, back,
// sides, underside). One call turns a grey loco into "Daylight", a tank into its camo scheme.

import type { Mesh, Vec2, Vec3 } from '../core/index.ts';

export interface LiveryRule {
  readonly color: Vec3;
  /** Height band [z0, z1] (metres). */
  readonly z?: readonly [number, number];
  /** Along-length band [x0, x1] (metres, +X forward). */
  readonly x?: readonly [number, number];
  /** Polygon in the side elevation (x, z): the region a stripe or panel covers. */
  readonly poly?: readonly Vec2[];
  /** Only faces whose normal points this way (n·axis > 0.5; roof: n.z > 0.55). */
  readonly facing?: 'roof' | 'under' | 'front' | 'back' | 'side';
  /** Multiply into the existing colour instead of replacing it (weathering, shading). */
  readonly multiply?: boolean;
}

export interface Livery {
  readonly base?: Vec3;
  readonly rules: readonly LiveryRule[];
}

function inPoly(poly: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i] ?? [0, 0];
    const [xj, zj] = poly[j] ?? [0, 0];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function faces(f: NonNullable<LiveryRule['facing']>, n: Vec3): boolean {
  if (f === 'roof') return n[2] > 0.55;
  if (f === 'under') return n[2] < -0.55;
  if (f === 'front') return n[0] > 0.5;
  if (f === 'back') return n[0] < -0.5;
  return Math.abs(n[1]) > 0.5;
}

export function livery(mesh: Mesh, l: Livery): Mesh {
  const colors = new Float32Array(mesh.colors);
  for (let i = 0; i < mesh.positions.length / 3; i++) {
    const x = mesh.positions[i * 3] ?? 0;
    const z = mesh.positions[i * 3 + 2] ?? 0;
    const n: Vec3 = [
      mesh.normals[i * 3] ?? 0,
      mesh.normals[i * 3 + 1] ?? 0,
      mesh.normals[i * 3 + 2] ?? 0,
    ];
    let c: Vec3 = l.base ?? [colors[i * 3] ?? 1, colors[i * 3 + 1] ?? 1, colors[i * 3 + 2] ?? 1];
    for (const r of l.rules) {
      if (r.z && (z < r.z[0] || z > r.z[1])) continue;
      if (r.x && (x < r.x[0] || x > r.x[1])) continue;
      if (r.poly && !inPoly(r.poly, x, z)) continue;
      if (r.facing && !faces(r.facing, n)) continue;
      c = r.multiply ? [c[0] * r.color[0], c[1] * r.color[1], c[2] * r.color[2]] : r.color;
    }
    colors.set(c, i * 3);
  }
  return { ...mesh, colors };
}
