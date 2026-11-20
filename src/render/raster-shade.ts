// The contact sheet's opaque surface shader, per pixel (D450–D452): what an engine interpolates
// is interpolated here too — vertex colour, the smooth vertex normal (renormalised) for the
// Lambert term, and the UV under which the trim-sheet albedo is sampled (sheet-tones.ts
// `albedoAt`, mip chosen per triangle by its texel footprint). A flat-shaded mesh carries one
// normal per face corner, so it still draws flat; a smooth one draws smooth. Cutout cards drop
// the pixels whose sheet texel is cut away (D300).

import type { Vec3 } from '../core/index.ts';
import type { Camera, Target } from './raster.ts';
import { fill, projectAll, srgb8 } from './raster-fill.ts';
import { albedoAt, cutAt, type SheetTones } from './sheet-tones.ts';
import { footprintMip } from './vis-buffer.ts';
import type { worldParts } from './world-parts.ts';

export type WorldPart = ReturnType<typeof worldParts>[number];

/** Diffuse floor and slope: shade = AMBIENT + DIFFUSE · max(0, n · light). */
export const AMBIENT = 0.35;
export const DIFFUSE = 0.65;

const ALB = new Float32Array(3);

/** Mip level of the trim sheet for triangle (a, b, c): texels per pixel, isotropic. */
export function sheetLevel(
  P: ReturnType<typeof projectAll>,
  uv: Float32Array,
  a: number,
  b: number,
  c: number,
  size: number,
): number {
  const ax = P.X[a] ?? 0;
  const ay = P.Y[a] ?? 0;
  const ua = uv[a * 2] ?? 0;
  const va = uv[a * 2 + 1] ?? 0;
  return footprintMip(
    (P.X[b] ?? 0) - ax,
    (P.Y[b] ?? 0) - ay,
    (P.X[c] ?? 0) - ax,
    (P.Y[c] ?? 0) - ay,
    (uv[b * 2] ?? 0) - ua,
    (uv[b * 2 + 1] ?? 0) - va,
    (uv[c * 2] ?? 0) - ua,
    (uv[c * 2 + 1] ?? 0) - va,
    size,
    false,
  );
}

/** Draw the opaque (or cutout) part `m` into `t`, lit from unit `light`. */
export function drawSmooth(
  t: Target,
  cam: Camera,
  m: WorldPart,
  tones: SheetTones | undefined,
  light: Vec3,
): void {
  const P = projectAll(cam.project, m.positions);
  const N = m.normals;
  const C = m.colors;
  const U = m.uvs;
  const cut = m.cutout ? tones : undefined;
  const [lx, ly, lz] = light;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] ?? 0;
    const b = m.indices[i + 1] ?? 0;
    const c = m.indices[i + 2] ?? 0;
    const level = tones ? sheetLevel(P, U, a, b, c, tones.sheet.size) : 0;
    fill(t.depth, t.width, t.height, P, a, b, c, (k, w0, w1, w2) => {
      const u = (U[a * 2] ?? 0) * w0 + (U[b * 2] ?? 0) * w1 + (U[c * 2] ?? 0) * w2;
      const v = (U[a * 2 + 1] ?? 0) * w0 + (U[b * 2 + 1] ?? 0) * w1 + (U[c * 2 + 1] ?? 0) * w2;
      if (cut && cutAt(cut, u, v)) return false;
      const nx = (N[a * 3] ?? 0) * w0 + (N[b * 3] ?? 0) * w1 + (N[c * 3] ?? 0) * w2;
      const ny = (N[a * 3 + 1] ?? 0) * w0 + (N[b * 3 + 1] ?? 0) * w1 + (N[c * 3 + 1] ?? 0) * w2;
      const nz = (N[a * 3 + 2] ?? 0) * w0 + (N[b * 3 + 2] ?? 0) * w1 + (N[c * 3 + 2] ?? 0) * w2;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const shade = AMBIENT + DIFFUSE * Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
      if (tones) albedoAt(tones, level, u, v, ALB);
      const o = k * 4;
      for (let q = 0; q < 3; q++) {
        const col = (C[a * 3 + q] ?? 1) * w0 + (C[b * 3 + q] ?? 1) * w1 + (C[c * 3 + q] ?? 1) * w2;
        t.px[o + q] = srgb8(col * (tones ? (ALB[q] ?? 1) : 1) * shade);
      }
      t.px[o + 3] = 255;
      return true;
    });
  }
}
