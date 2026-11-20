// See-through parts on the contact sheet (glass, ice, liquid, jelly…), drawn after every opaque
// part as ONE nearest layer in front of the opaque depth, then composited (D453, D454). The model
// is a thin transmissive surface seen by an engine with KHR_materials_transmission, simplified to
// stay deterministic and cheap:
//   behind × filter × (1 − F) + F × HORIZON + highlight
// where filter = mix(1, tint, alpha) tints what is behind by the part's colour (vertex colour ×
// sheet albedo) at the material's fallback `alpha`, F is Schlick's Fresnel term on the per-pixel
// normal (4% face-on, all at grazing), HORIZON is the studio's dim surroundings a grazing surface
// mirrors, and the highlight is a Blinn-Phong glint of the key light. Face-on glass therefore
// shows what is behind nearly unchanged, and its silhouette and glint draw the form. Where
// nothing opaque is behind (a thumbnail's transparent background) the surface covers
// alpha + (1 − alpha)·F of the pixel in its own lit colour plus the reflection.

import type { Vec3 } from '../core/index.ts';
import type { Camera, Target } from './raster.ts';
import { fill, projectAll, srgb8 } from './raster-fill.ts';
import { AMBIENT, DIFFUSE, sheetLevel, type WorldPart } from './raster-shade.ts';
import { albedoAt, type SheetTones } from './sheet-tones.ts';
import { SRGB } from './texture.ts';

/** Linear colour a grazing glass surface reflects: the dim, slightly cool studio surroundings. */
const HORIZON: Vec3 = [0.3, 0.33, 0.37];
/** Peak of the key light's glint on glass (linear, added). */
const GLINT = 0.9;

const ALB = new Float32Array(3);

/** Unit `v`, by sqrt only (IEEE-exact). */
const norm = (v: Vec3): Vec3 => {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** The direction the (affine) camera looks along, in world space: the gradient of its depth. */
function viewDir(cam: Camera): Vec3 {
  const o = cam.project([0, 0, 0])[2];
  return norm([
    cam.project([1, 0, 0])[2] - o,
    cam.project([0, 1, 0])[2] - o,
    cam.project([0, 0, 1])[2] - o,
  ]);
}

/** Draw the see-through `parts` (each with an `opacity`) over the opaque image in `t`. */
export function drawGlass(
  t: Target,
  cam: Camera,
  parts: readonly WorldPart[],
  tones: SheetTones,
  light: Vec3,
): void {
  const n = t.width * t.height;
  const depth = t.depth.slice();
  const hit = new Uint8Array(n);
  const filter = new Float32Array(n * 3);
  const self = new Float32Array(n * 3);
  const fres = new Float32Array(n);
  const glint = new Float32Array(n);
  const cover = new Float32Array(n);
  const f = viewDir(cam);
  const h = norm([light[0] - f[0], light[1] - f[1], light[2] - f[2]]);
  for (const m of parts) {
    const alpha = m.opacity ?? 1;
    const P = projectAll(cam.project, m.positions);
    const N = m.normals;
    const C = m.colors;
    const U = m.uvs;
    for (let i = 0; i < m.indices.length; i += 3) {
      const a = m.indices[i] ?? 0;
      const b = m.indices[i + 1] ?? 0;
      const c = m.indices[i + 2] ?? 0;
      const level = sheetLevel(P, U, a, b, c, tones.sheet.size);
      fill(depth, t.width, t.height, P, a, b, c, (k, w0, w1, w2) => {
        let nx = (N[a * 3] ?? 0) * w0 + (N[b * 3] ?? 0) * w1 + (N[c * 3] ?? 0) * w2;
        let ny = (N[a * 3 + 1] ?? 0) * w0 + (N[b * 3 + 1] ?? 0) * w1 + (N[c * 3 + 1] ?? 0) * w2;
        let nz = (N[a * 3 + 2] ?? 0) * w0 + (N[b * 3 + 2] ?? 0) * w1 + (N[c * 3 + 2] ?? 0) * w2;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        // Facing the camera: a thin shell is seen from whichever side looks at it.
        const s = nx * f[0] + ny * f[1] + nz * f[2] > 0 ? -1 / nl : 1 / nl;
        nx *= s;
        ny *= s;
        nz *= s;
        const x = 1 - Math.min(1, Math.abs(nx * f[0] + ny * f[1] + nz * f[2]));
        const F = 0.04 + 0.96 * x * x * x * x * x;
        let g = Math.max(0, nx * h[0] + ny * h[1] + nz * h[2]);
        for (let p = 0; p < 6; p++) g *= g;
        const shade =
          AMBIENT + DIFFUSE * Math.max(0, nx * light[0] + ny * light[1] + nz * light[2]);
        const u = (U[a * 2] ?? 0) * w0 + (U[b * 2] ?? 0) * w1 + (U[c * 2] ?? 0) * w2;
        const v = (U[a * 2 + 1] ?? 0) * w0 + (U[b * 2 + 1] ?? 0) * w1 + (U[c * 2 + 1] ?? 0) * w2;
        albedoAt(tones, level, u, v, ALB);
        for (let q = 0; q < 3; q++) {
          const tint =
            ((C[a * 3 + q] ?? 1) * w0 + (C[b * 3 + q] ?? 1) * w1 + (C[c * 3 + q] ?? 1) * w2) *
            (ALB[q] ?? 1);
          filter[k * 3 + q] = 1 - alpha + alpha * tint;
          self[k * 3 + q] = tint * shade * (1 - F) + F * (HORIZON[q] ?? 0) + GLINT * g;
        }
        fres[k] = F;
        glint[k] = GLINT * g;
        cover[k] = Math.min(1, alpha + (1 - alpha) * F + GLINT * g);
        hit[k] = 1;
        return true;
      });
    }
  }
  for (let k = 0; k < n; k++) {
    if (!hit[k]) continue;
    const o = k * 4;
    const under = (t.px[o + 3] ?? 0) / 255;
    const cov = cover[k] ?? 0;
    const out = under + (1 - under) * cov;
    const F = fres[k] ?? 0;
    for (let q = 0; q < 3; q++) {
      const behind = SRGB[t.px[o + q] ?? 0] ?? 0;
      const over =
        behind * (filter[k * 3 + q] ?? 1) * (1 - F) + F * (HORIZON[q] ?? 0) + (glint[k] ?? 0);
      const mine = self[k * 3 + q] ?? 0;
      t.px[o + q] = srgb8((under * over + (1 - under) * cov * mine) / (out || 1));
    }
    t.px[o + 3] = Math.round(out * 255);
    t.depth[k] = depth[k] ?? Infinity;
  }
}
