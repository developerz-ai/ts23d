// Visibility buffer: perspective-rasterise every triangle once, keeping only the nearest triangle
// id and its perspective-correct barycentrics per pixel. Shading then runs exactly once per pixel
// (deferred), so overdraw on an 88k-triangle tank costs a depth compare, not a lighting model.
// Mip per triangle: texel÷pixel area for opaque surfaces; cutouts use the minor axis of the
// footprint (anisotropy-aware, ≤ MAX_ANISO) so long thin cards keep their alpha detail.

import type { PerspectiveCamera } from './camera.ts';
import type { Scene } from './scene.ts';

export interface VisBuffer {
  readonly width: number;
  readonly height: number;
  /** Triangle id per pixel, −1 = background. */
  readonly tri: Int32Array;
  /** Perspective-correct barycentrics of vertices 1 and 2 (vertex 0 = 1 − b1 − b2). */
  readonly b1: Float32Array;
  readonly b2: Float32Array;
  /** 1 / view depth (larger = nearer). */
  readonly invw: Float32Array;
  /** Per-triangle texture mip level from its texel : pixel footprint. */
  readonly mip: Uint8Array;
}

/** Anisotropy cap for cutout mip selection (a GPU's 16× anisotropic filtering). */
const MAX_ANISO = 16;

/**
 * Mip level of a triangle from its screen edges (sx, sy, pixels) and UV edges (du, dv) on a
 * `texSize`² sheet:
 * isotropic = ½·log2(texel area ÷ pixel area); `aniso` = log2 of the footprint's minor axis,
 * never finer than the major axis ÷ MAX_ANISO.
 */
export function footprintMip(
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  du1: number,
  dv1: number,
  du2: number,
  dv2: number,
  texSize: number,
  aniso: boolean,
): number {
  const area = sx1 * sy2 - sy1 * sx2;
  const uvArea = Math.abs(du1 * dv2 - dv1 * du2);
  let lod = 0.5 * Math.log2((uvArea * texSize * texSize) / Math.abs(area) + 1e-12);
  if (aniso) {
    // Jacobian d(u, v)/d(x, y) = F · E⁻¹, then its singular values.
    const p = (du1 * sy2 - du2 * sy1) / area;
    const q = (du2 * sx1 - du1 * sx2) / area;
    const r = (dv1 * sy2 - dv2 * sy1) / area;
    const t = (dv2 * sx1 - dv1 * sx2) / area;
    const T = texSize;
    const e = T * T * (p * p + q * q + r * r + t * t);
    const det = T * T * Math.abs(p * t - q * r);
    const major = Math.sqrt((e + Math.sqrt(Math.max(0, e * e - 4 * det * det))) / 2);
    const minor = major > 0 ? det / major : 0;
    lod = Math.log2(Math.max(minor, major / MAX_ANISO) + 1e-12);
  }
  return Math.max(0, Math.min(10, Math.floor(lod + 0.25)));
}

/** Return false to discard a fragment (alpha-tested cutouts). */
export type AlphaTest = (tri: number, b1: number, b2: number, mip: number) => boolean;

export function rasteriseVis(
  s: Scene,
  cam: PerspectiveCamera,
  texSize: number,
  alpha?: AlphaTest,
  /** Triangles to leave out (non-zero): the see-through ones, for the "behind" buffer. */
  skip?: Uint8Array,
): VisBuffer {
  const W = cam.width;
  const H = cam.height;
  const n = W * H;
  const tri = new Int32Array(n).fill(-1);
  const b1 = new Float32Array(n);
  const b2 = new Float32Array(n);
  const invw = new Float32Array(n);
  const nv = s.positions.length / 3;
  const sx = new Float32Array(nv);
  const sy = new Float32Array(nv);
  const iw = new Float32Array(nv);
  const P = s.positions;
  const [ex, ey, ez] = cam.eye;
  for (let v = 0; v < nv; v++) {
    const dx = (P[v * 3] ?? 0) - ex;
    const dy = (P[v * 3 + 1] ?? 0) - ey;
    const dz = (P[v * 3 + 2] ?? 0) - ez;
    const w = dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2];
    const q = w > 1e-4 ? 1 / w : -1;
    iw[v] = q;
    sx[v] = cam.cx + (dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2]) * q * cam.focal;
    sy[v] = cam.cy - (dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2]) * q * cam.focal;
  }
  const mip = new Uint8Array(s.triangles);
  const I = s.indices;
  const UV = s.uvs;
  for (let t = 0; t < s.triangles; t++) {
    if (skip?.[t]) continue;
    const a = I[t * 3] ?? 0;
    const b = I[t * 3 + 1] ?? 0;
    const c = I[t * 3 + 2] ?? 0;
    const qa = iw[a] ?? -1;
    const qb = iw[b] ?? -1;
    const qc = iw[c] ?? -1;
    if (qa < 0 || qb < 0 || qc < 0) continue;
    const ax = sx[a] ?? 0;
    const ay = sy[a] ?? 0;
    const bx = sx[b] ?? 0;
    const by = sy[b] ?? 0;
    const cx = sx[c] ?? 0;
    const cy = sy[c] ?? 0;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const cut = alpha !== undefined && s.surface[t] === 1;
    const ua = UV[a * 2] ?? 0;
    const va = UV[a * 2 + 1] ?? 0;
    const m = footprintMip(
      bx - ax,
      by - ay,
      cx - ax,
      cy - ay,
      (UV[b * 2] ?? 0) - ua,
      (UV[b * 2 + 1] ?? 0) - va,
      (UV[c * 2] ?? 0) - ua,
      (UV[c * 2 + 1] ?? 0) - va,
      s.sets[(s.texSet[t] ?? 0) - 1]?.size ?? texSize,
      s.surface[t] === 1,
    );
    mip[t] = m;
    const lx = ax < bx ? Math.min(ax, cx) : Math.min(bx, cx);
    const hx = ax > bx ? Math.max(ax, cx) : Math.max(bx, cx);
    const ly = ay < by ? Math.min(ay, cy) : Math.min(by, cy);
    const hy = ay > by ? Math.max(ay, cy) : Math.max(by, cy);
    const minX = lx < 0 ? 0 : Math.floor(lx);
    const maxX = hx > W - 1 ? W - 1 : Math.ceil(hx);
    const minY = ly < 0 ? 0 : Math.floor(ly);
    const maxY = hy > H - 1 ? H - 1 : Math.ceil(hy);
    if (minX > maxX || minY > maxY) continue;
    const inv = 1 / area;
    // Affine edge functions, stepped per pixel.
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
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * qa + w1 * qb + w2 * qc;
        const i = y * W + x;
        if (z <= (invw[i] ?? 0)) continue;
        const pb = (w1 * qb) / z;
        const pc = (w2 * qc) / z;
        if (cut && alpha && !alpha(t, pb, pc, m)) continue;
        invw[i] = z;
        tri[i] = t;
        b1[i] = pb;
        b2[i] = pc;
      }
    }
  }
  return { width: W, height: H, tri, b1, b2, invw, mip };
}
