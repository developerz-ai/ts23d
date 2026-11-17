// The contact sheet's rasteriser for a part with its own texture set (ADR 016): where the sheet's
// code-built parts are flat-shaded in vertex colour, a model-built part is drawn per pixel —
// albedo × vertex colour, the set's normal map on the smooth normal, the same Lambert light — so
// what the agent reads in sheet.png is the surface the GLB carries. Cutout parts drop the pixels
// under the alpha cut.

import type { Mesh, Vec3 } from '../core/index.ts';
import { uvTangents } from '../passes/index.ts';
import { ALPHA_CUT } from './alpha-mips.ts';
import { toSrgb8 } from './lighting.ts';
import type { Camera, Target } from './raster.ts';
import { SET_OUT, setSurface } from './set-shade.ts';
import type { SetTextures } from './texture-sets.ts';
import { footprintMip } from './vis-buffer.ts';

/** Draw world-space `m` textured by `set`, lit from `light` (unit), z-tested into `t`. */
export function drawTextured(
  t: Target,
  cam: Camera,
  m: Mesh,
  set: SetTextures,
  cutout: boolean,
  light: Vec3,
): void {
  const nv = m.positions.length / 3;
  const X = new Float32Array(nv);
  const Y = new Float32Array(nv);
  const Z = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    const p = cam.project([
      m.positions[v * 3] ?? 0,
      m.positions[v * 3 + 1] ?? 0,
      m.positions[v * 3 + 2] ?? 0,
    ]);
    X[v] = p[0];
    Y[v] = p[1];
    Z[v] = p[2];
  }
  const vtan = uvTangents(m);
  const N = m.normals;
  const C = m.colors;
  const U = m.uvs;
  const O = SET_OUT;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i] ?? 0;
    const b = m.indices[i + 1] ?? 0;
    const c = m.indices[i + 2] ?? 0;
    const ax = X[a] ?? 0;
    const ay = Y[a] ?? 0;
    const bx = X[b] ?? 0;
    const by = Y[b] ?? 0;
    const cx = X[c] ?? 0;
    const cy = Y[c] ?? 0;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const ua = U[a * 2] ?? 0;
    const va = U[a * 2 + 1] ?? 0;
    const ub = U[b * 2] ?? 0;
    const vb = U[b * 2 + 1] ?? 0;
    const uc = U[c * 2] ?? 0;
    const vc = U[c * 2 + 1] ?? 0;
    const mip = footprintMip(
      bx - ax,
      by - ay,
      cx - ax,
      cy - ay,
      ub - ua,
      vb - va,
      uc - ua,
      vc - va,
      set.size,
      cutout,
    );
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(t.width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(t.height - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * (Z[a] ?? 0) + w1 * (Z[b] ?? 0) + w2 * (Z[c] ?? 0);
        const k = y * t.width + x;
        if (z >= (t.depth[k] ?? Infinity)) continue;
        let nx = (N[a * 3] ?? 0) * w0 + (N[b * 3] ?? 0) * w1 + (N[c * 3] ?? 0) * w2;
        let ny = (N[a * 3 + 1] ?? 0) * w0 + (N[b * 3 + 1] ?? 0) * w1 + (N[c * 3 + 1] ?? 0) * w2;
        let nz = (N[a * 3 + 2] ?? 0) * w0 + (N[b * 3 + 2] ?? 0) * w1 + (N[c * 3 + 2] ?? 0) * w2;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const u = ua * w0 + ub * w1 + uc * w2;
        const v = va * w0 + vb * w1 + vc * w2;
        setSurface(set, vtan, a, b, c, w0, w1, w2, u, v, mip, nx, ny, nz, 1, O);
        if (cutout && (O[6] ?? 1) < ALPHA_CUT) continue;
        const lit = (O[0] ?? 0) * light[0] + (O[1] ?? 0) * light[1] + (O[2] ?? 0) * light[2];
        const shade = 0.35 + 0.65 * Math.max(0, lit);
        const o = k * 4;
        for (let q = 0; q < 3; q++) {
          const col =
            (C[a * 3 + q] ?? 1) * w0 + (C[b * 3 + q] ?? 1) * w1 + (C[c * 3 + q] ?? 1) * w2;
          t.px[o + q] = toSrgb8((O[3 + q] ?? 1) * col * shade);
        }
        t.px[o + 3] = 255;
        t.depth[k] = z;
      }
    }
  }
}
