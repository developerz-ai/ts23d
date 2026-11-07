// Orthographic depth maps along a direction: the sun's shadow map, the sky-direction maps that
// give ambient occlusion (and the soft contact shadow on the ground), and the silhouette masks the
// review metrics compare. Stores, per texel, the highest dot(p, dir) — the surface nearest the light.

import type { Scene } from './scene.ts';

export interface DepthMap {
  readonly size: number;
  /** −Infinity where nothing was drawn. */
  readonly data: Float32Array;
  readonly dir: readonly [number, number, number];
  readonly r: readonly [number, number, number];
  readonly u: readonly [number, number, number];
  /** Texel coordinate = (dot(p, r) − r0) · k, (u1 − dot(p, u)) · k. */
  readonly r0: number;
  readonly u1: number;
  readonly k: number;
}

/** Map frame in the map's own (r, u) coordinates: centre and half-extent, metres. */
export interface MapFrame {
  readonly cr: number;
  readonly cu: number;
  readonly half: number;
}

export type MapAlpha = (tri: number, b1: number, b2: number) => boolean;

export function mapAxes(dir: readonly [number, number, number]): {
  r: [number, number, number];
  u: [number, number, number];
} {
  const up: [number, number, number] = Math.abs(dir[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1];
  let r: [number, number, number] = [
    up[1] * dir[2] - up[2] * dir[1],
    up[2] * dir[0] - up[0] * dir[2],
    up[0] * dir[1] - up[1] * dir[0],
  ];
  const l = Math.hypot(r[0], r[1], r[2]) || 1;
  r = [r[0] / l, r[1] / l, r[2] / l];
  const u: [number, number, number] = [
    dir[1] * r[2] - dir[2] * r[1],
    dir[2] * r[0] - dir[0] * r[2],
    dir[0] * r[1] - dir[1] * r[0],
  ];
  return { r, u };
}

/** The frame that just contains the scene seen along `dir`, with a 2% margin. */
export function fitFrame(s: Scene, dir: readonly [number, number, number]): MapFrame {
  const { r, u } = mapAxes(dir);
  let r0 = Infinity;
  let r1 = -Infinity;
  let u0 = Infinity;
  let u1 = -Infinity;
  const P = s.positions;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i] ?? 0;
    const y = P[i + 1] ?? 0;
    const z = P[i + 2] ?? 0;
    const a = x * r[0] + y * r[1] + z * r[2];
    const b = x * u[0] + y * u[1] + z * u[2];
    if (a < r0) r0 = a;
    if (a > r1) r1 = a;
    if (b < u0) u0 = b;
    if (b > u1) u1 = b;
  }
  if (!Number.isFinite(r0)) return { cr: 0, cu: 0, half: 1 };
  return { cr: (r0 + r1) / 2, cu: (u0 + u1) / 2, half: Math.max(r1 - r0, u1 - u0, 1e-3) * 0.51 };
}

export function depthMap(
  s: Scene,
  dir: readonly [number, number, number],
  size: number,
  frame: MapFrame = fitFrame(s, dir),
  alpha?: MapAlpha,
): DepthMap {
  const { r, u } = mapAxes(dir);
  const k = size / (2 * frame.half);
  const r0 = frame.cr - frame.half;
  const u1 = frame.cu + frame.half;
  const data = new Float32Array(size * size).fill(-Infinity);
  const nv = s.positions.length / 3;
  const X = new Float32Array(nv);
  const Y = new Float32Array(nv);
  const D = new Float32Array(nv);
  const P = s.positions;
  for (let v = 0; v < nv; v++) {
    const x = P[v * 3] ?? 0;
    const y = P[v * 3 + 1] ?? 0;
    const z = P[v * 3 + 2] ?? 0;
    X[v] = (x * r[0] + y * r[1] + z * r[2] - r0) * k;
    Y[v] = (u1 - (x * u[0] + y * u[1] + z * u[2])) * k;
    D[v] = x * dir[0] + y * dir[1] + z * dir[2];
  }
  const I = s.indices;
  for (let t = 0; t < s.triangles; t++) {
    const a = I[t * 3] ?? 0;
    const b = I[t * 3 + 1] ?? 0;
    const c = I[t * 3 + 2] ?? 0;
    const ax = X[a] ?? 0;
    const ay = Y[a] ?? 0;
    const bx = X[b] ?? 0;
    const by = Y[b] ?? 0;
    const cx = X[c] ?? 0;
    const cy = Y[c] ?? 0;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const inv = 1 / area;
    const da = D[a] ?? 0;
    const db = D[b] ?? 0;
    const dc = D[c] ?? 0;
    const cut = alpha !== undefined && s.surface[t] === 1;
    const lx = ax < bx ? Math.min(ax, cx) : Math.min(bx, cx);
    const hx = ax > bx ? Math.max(ax, cx) : Math.max(bx, cx);
    const ly = ay < by ? Math.min(ay, cy) : Math.min(by, cy);
    const hy = ay > by ? Math.max(ay, cy) : Math.max(by, cy);
    const minX = lx < 0 ? 0 : Math.floor(lx);
    const maxX = hx > size - 1 ? size - 1 : Math.ceil(hx);
    const minY = ly < 0 ? 0 : Math.floor(ly);
    const maxY = hy > size - 1 ? size - 1 : Math.ceil(hy);
    // Edge functions are affine in (px, py): step them instead of re-evaluating per texel.
    const A0 = (by - cy) * inv;
    const B0 = (cx - bx) * inv;
    const A1 = (cy - ay) * inv;
    const B1 = (ax - cx) * inv;
    const C0 = (bx * cy - by * cx) * inv;
    const C1 = (cx * ay - cy * ax) * inv;
    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      let w0 = C0 + A0 * (minX + 0.5) + B0 * py;
      let w1 = C1 + A1 * (minX + 0.5) + B1 * py;
      for (let x = minX; x <= maxX; x++, w0 += A0, w1 += A1) {
        if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue;
        const d = w0 * da + w1 * db + (1 - w0 - w1) * dc;
        const i = y * size + x;
        if (d <= (data[i] ?? 0)) continue;
        if (cut && alpha && !alpha(t, w1, 1 - w0 - w1)) continue;
        data[i] = d;
      }
    }
  }
  return { size, data, dir, r, u, r0, u1, k };
}

/**
 * Fraction of `taps` (pairs of texel offsets) at which world point (x,y,z) sees past the map —
 * 1 = fully lit/open, 0 = fully occluded. `bias` in metres along the map direction.
 */
export function visibility(
  m: DepthMap,
  x: number,
  y: number,
  z: number,
  bias: number,
  taps: Float32Array,
): number {
  const tx = (x * m.r[0] + y * m.r[1] + z * m.r[2] - m.r0) * m.k;
  const ty = (m.u1 - (x * m.u[0] + y * m.u[1] + z * m.u[2])) * m.k;
  const d = x * m.dir[0] + y * m.dir[1] + z * m.dir[2] + bias;
  const s = m.size;
  let lit = 0;
  for (let i = 0; i < taps.length; i += 2) {
    const px = Math.floor(tx + (taps[i] ?? 0));
    const py = Math.floor(ty + (taps[i + 1] ?? 0));
    if (px < 0 || py < 0 || px >= s || py >= s || d >= (m.data[py * s + px] ?? 0)) lit++;
  }
  return (lit * 2) / taps.length;
}

/**
 * Ambient openness at (x,y,z) along the map direction, 0…1: an occluder `reach` metres or more
 * away counts for nothing, nearer ones linearly more — AO with a falloff, so a few sky directions
 * give a soft contact shadow instead of long streaks.
 */
export function openness(
  m: DepthMap,
  x: number,
  y: number,
  z: number,
  bias: number,
  reach: number,
): number {
  const px = Math.floor((x * m.r[0] + y * m.r[1] + z * m.r[2] - m.r0) * m.k);
  const py = Math.floor((m.u1 - (x * m.u[0] + y * m.u[1] + z * m.u[2])) * m.k);
  const s = m.size;
  if (px < 0 || py < 0 || px >= s || py >= s) return 1;
  const gap = (m.data[py * s + px] ?? 0) - (x * m.dir[0] + y * m.dir[1] + z * m.dir[2] + bias);
  return gap <= 0 ? 1 : gap >= reach ? 1 : gap / reach;
}
