// Skin ordered closed rings with equal vertex counts: haystacks, grain sacks, wheat stooks, hulls,
// fuselages, buttressed trunk flares. SMOOTH normals (central differences around and along; caps
// flat), forced outward whichever way the rings wind. Positions are absolute (no `at`). UVs:
// 'length' (default) U = metres along the ring centroids, V once around the band; 'row' U =
// metres around each ring, V along; 'swap' one unscaled wrap (U around 0–1, V along 0–1).
// Triangles = 2·N·(R−1) + N per cap (N vertices per ring, R rings).

import { type Mesh, MeshBuilder, Ts23dError, type Vec3 } from '../core/index.ts';
import { type StripId, stripRect } from '../material/index.ts';

export type LoftColor = Vec3 | ((ring: readonly Vec3[], i: number, p: Vec3) => Vec3);

export interface LoftOptions {
  readonly rings: readonly (readonly Vec3[])[];
  /** One colour, or one per vertex from (ring, ring index, point). */
  readonly color: LoftColor;
  readonly strip?: StripId;
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
  readonly uv?: 'length' | 'row' | 'swap';
}

/** An elliptical ring in the plane z = centre.z, CCW seen from +Z; `wobble(angle)` scales radius. */
export function ringXY(
  centre: Vec3,
  rx: number,
  ry: number,
  segments: number,
  wobble?: (angle: number) => number,
  phase = 0,
): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < segments; k++) {
    const a = phase + (k / segments) * Math.PI * 2;
    const w = wobble ? wobble(a) : 1;
    out.push([centre[0] + rx * Math.cos(a) * w, centre[1] + ry * Math.sin(a) * w, centre[2]]);
  }
  return out;
}

const invalid = (cause: string, fix: string): Ts23dError =>
  new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });

const centroid = (r: readonly Vec3[]): Vec3 => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of r) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / r.length, y / r.length, z / r.length];
};

export function loft(o: LoftOptions): Mesh {
  const R = o.rings.length;
  if (R < 2) throw invalid(`loft has ${R} ring(s)`, 'pass at least 2 rings (bottom → top)');
  const N = o.rings[0]?.length ?? 0;
  if (N < 3) throw invalid(`loft rings have ${N} vertices`, 'give every ring at least 3 vertices');
  for (const [i, r] of o.rings.entries()) {
    if (r.length !== N) {
      throw invalid(
        `loft ring ${i} has ${r.length} vertices, ring 0 has ${N}`,
        'build every ring with the same vertex count (same `segments` in ringXY)',
      );
    }
  }
  const at = (i: number, k: number): Vec3 => o.rings[i]?.[((k % N) + N) % N] ?? [0, 0, 0];
  const cents = o.rings.map(centroid);
  const along = [0];
  for (let i = 1; i < R; i++) {
    const a = cents[i - 1] ?? [0, 0, 0];
    const b = cents[i] ?? a;
    along.push((along[i - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  const total = along[R - 1] || 1;
  // Raw normals (around × along); the sign of their sum against "outward from the centroid"
  // decides the winding for the whole loft.
  const raw: Vec3[] = [];
  let facing = 0;
  for (let i = 0; i < R; i++) {
    const c = cents[i] ?? [0, 0, 0];
    const ax = cents[Math.min(R - 1, i + 1)] ?? c;
    const bx = cents[Math.max(0, i - 1)] ?? c;
    const axis: Vec3 = [ax[0] - bx[0], ax[1] - bx[1], ax[2] - bx[2]];
    for (let k = 0; k < N; k++) {
      const p = at(i, k);
      const u0 = at(i, k - 1);
      const u1 = at(i, k + 1);
      const v0 = at(Math.max(0, i - 1), k);
      const v1 = at(Math.min(R - 1, i + 1), k);
      const tu: Vec3 = [u1[0] - u0[0], u1[1] - u0[1], u1[2] - u0[2]];
      const tv: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      let n: Vec3 = [
        tu[1] * tv[2] - tu[2] * tv[1],
        tu[2] * tv[0] - tu[0] * tv[2],
        tu[0] * tv[1] - tu[1] * tv[0],
      ];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-12) n = i === 0 ? [-axis[0], -axis[1], -axis[2]] : axis;
      facing += n[0] * (p[0] - c[0]) + n[1] * (p[1] - c[1]) + n[2] * (p[2] - c[2]);
      raw.push(n);
    }
  }
  const flip = facing < 0 ? -1 : 1;
  const rect = stripRect(o.strip ?? 'plain');
  const du = rect.u1 - rect.u0;
  const dv = rect.v1 - rect.v0;
  const mode = o.uv ?? 'length';
  const color = (i: number, p: Vec3): Vec3 =>
    typeof o.color === 'function' ? o.color(o.rings[i] ?? [], i, p) : o.color;
  const b = new MeshBuilder();
  for (let i = 0; i < R; i++) {
    let around = 0;
    for (let k = 0; k <= N; k++) {
      const p = at(i, k);
      if (k > 0) {
        const q = at(i, k - 1);
        around += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      }
      const n = raw[i * N + (k % N)] ?? [0, 0, 1];
      const l = (Math.hypot(n[0], n[1], n[2]) || 1) * flip;
      const s = (along[i] ?? 0) / rect.metres;
      const uv: [number, number] =
        mode === 'row'
          ? [rect.u0 + (around / rect.metres) * du, rect.v0 + ((along[i] ?? 0) / total) * dv]
          : mode === 'swap'
            ? [rect.u0 + (k / N) * du, rect.v0 + ((along[i] ?? 0) / total) * dv]
            : [rect.u0 + s * du, rect.v0 + (k / N) * dv];
      b.vertex({ p, n: [n[0] / l, n[1] / l, n[2] / l], uv, color: color(i, p) });
    }
  }
  for (let i = 0; i + 1 < R; i++) {
    const r0 = i * (N + 1);
    const r1 = r0 + N + 1;
    for (let k = 0; k < N; k++) {
      if (flip > 0) b.quad(r0 + k, r0 + k + 1, r1 + k + 1, r1 + k);
      else b.quad(r0 + k, r1 + k, r1 + k + 1, r0 + k + 1);
    }
  }
  const ends: [number, boolean][] = [
    [0, o.capStart === true],
    [R - 1, o.capEnd === true],
  ];
  for (const [i, on] of ends) {
    if (!on) continue;
    const c = cents[i] ?? [0, 0, 0];
    const other = cents[i === 0 ? 1 : R - 2] ?? c;
    const d: Vec3 = [c[0] - other[0], c[1] - other[1], c[2] - other[2]];
    const l = Math.hypot(d[0], d[1], d[2]) || 1;
    const nn: Vec3 = [d[0] / l, d[1] / l, d[2] / l];
    const mid = b.vertex({ p: c, n: nn, uv: [rect.u0, rect.v0], color: color(i, c) });
    for (let k = 0; k < N; k++) {
      const p = at(i, k);
      b.vertex({ p, n: nn, uv: [rect.u0, rect.v1], color: color(i, p) });
    }
    // Cap winding: CCW seen from outside (along nn). Ring order relative to nn sets the sense.
    const e1 = at(i, 0);
    const e2 = at(i, 1);
    const cr: Vec3 = [
      (e1[1] - c[1]) * (e2[2] - c[2]) - (e1[2] - c[2]) * (e2[1] - c[1]),
      (e1[2] - c[2]) * (e2[0] - c[0]) - (e1[0] - c[0]) * (e2[2] - c[2]),
      (e1[0] - c[0]) * (e2[1] - c[1]) - (e1[1] - c[1]) * (e2[0] - c[0]),
    ];
    const ccw = cr[0] * nn[0] + cr[1] * nn[1] + cr[2] * nn[2] >= 0;
    for (let k = 0; k < N; k++) {
      const a = mid + 1 + k;
      const z = mid + 1 + ((k + 1) % N);
      if (ccw) b.tri(mid, a, z);
      else b.tri(mid, z, a);
    }
  }
  return b.build();
}
