// CPU rasteriser: orthographic, z-buffered, Lambert-shaded triangles plus depth-tested lines.
// Slow by GPU standards and fast enough for 6 × 400² views of a game asset in well under a second.
// One flat colour per triangle: vertex colour, times the trim sheet's mean albedo for the
// triangle's strip when the caller passes `tones` (sheet-tones.ts), so a white-tinted oak plank is
// brown as in the hero. With tones, see-through parts (glass, ice, liquid…) are drawn last as one
// nearest layer blended over what is behind; without, the output is the form-only render it
// always was. Cutout cards on the sheet (leaves, needles, fur) are alpha-tested per pixel against
// the sheet's texels, so the panels show foliage's real silhouette (D300); that needs `tones` too.
// Parts with their own texture set (ADR 016) are drawn per pixel by raster-textured.ts.

import type { CompiledAsset, Vec3 } from '../core/index.ts';
import { cross, dot, normalize, sub } from '../core/index.ts';
import { drawTextured } from './raster-textured.ts';
import { cutAt, type SheetTones, toneAt } from './sheet-tones.ts';
import { setTextures } from './texture-sets.ts';
import { worldParts } from './world-parts.ts';

export { worldParts } from './world-parts.ts';

export interface View {
  readonly label: string;
  /** Direction the camera looks along (world, Z up). */
  readonly dir: Vec3;
  readonly up: Vec3;
}

export interface Target {
  readonly px: Uint8Array;
  readonly depth: Float32Array;
  readonly width: number;
  readonly height: number;
}

export interface Camera {
  project(p: Vec3): Vec3;
}

export function orthoCamera(view: View, centre: Vec3, extent: number, size: number): Camera {
  const f = normalize(view.dir);
  const r = normalize(cross(f, view.up));
  const u = cross(r, f);
  const k = size / (extent * 1.15);
  return {
    project: (p) => {
      const d = sub(p, centre);
      return [size / 2 + dot(d, r) * k, size / 2 - dot(d, u) * k, dot(d, f)];
    },
  };
}

const LIGHT = normalize([0.4, -0.6, 0.8]);

/** UVs of the triangle being drawn, read by `tri` when it alpha-tests: ua, va, ub, vb, uc, vc. */
const UV = new Float32Array(6);

/** Fill one triangle; with `cut`, drop the pixels whose sheet texel (UV above) is cut away. */
function tri(
  t: Target,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  rgb: Vec3,
  alpha: number,
  cut?: SheetTones,
): void {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(t.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(t.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-9) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const i = y * t.width + x;
      if (z >= (t.depth[i] ?? Infinity)) continue;
      if (
        cut &&
        cutAt(
          cut,
          w0 * (UV[0] ?? 0) + w1 * (UV[2] ?? 0) + w2 * (UV[4] ?? 0),
          w0 * (UV[1] ?? 0) + w1 * (UV[3] ?? 0) + w2 * (UV[5] ?? 0),
        )
      )
        continue;
      t.depth[i] = z;
      const o = i * 4;
      t.px[o] = rgb[0];
      t.px[o + 1] = rgb[1];
      t.px[o + 2] = rgb[2];
      t.px[o + 3] = alpha;
    }
  }
}

const toSrgb = (v: number): number =>
  Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));

type WorldPart = ReturnType<typeof worldParts>[number];
const WHITE = new Float32Array([1, 1, 1]);
const tone = new Float32Array(3);

/** Flat-shaded triangles of one part; `alpha` is the byte written beside the colour. */
function drawFlat(
  t: Target,
  cam: Camera,
  m: WorldPart,
  tones: SheetTones | undefined,
  alpha: number,
): void {
  for (let i = 0; i < m.indices.length; i += 3) {
    const ids = [m.indices[i] ?? 0, m.indices[i + 1] ?? 0, m.indices[i + 2] ?? 0];
    const pts = ids.map((v) =>
      cam.project([
        m.positions[v * 3] ?? 0,
        m.positions[v * 3 + 1] ?? 0,
        m.positions[v * 3 + 2] ?? 0,
      ]),
    );
    const v0 = ids[0] ?? 0;
    const n: Vec3 = [
      m.normals[v0 * 3] ?? 0,
      m.normals[v0 * 3 + 1] ?? 0,
      m.normals[v0 * 3 + 2] ?? 1,
    ];
    const shade = 0.35 + 0.65 * Math.max(0, dot(n, LIGHT));
    if (tones) {
      // The strip (or cell) under the triangle's UV centroid: one mean albedo per triangle.
      let u = 0;
      let v = 0;
      ids.forEach((id, k) => {
        UV[k * 2] = m.uvs[id * 2] ?? 0;
        UV[k * 2 + 1] = m.uvs[id * 2 + 1] ?? 0;
        u += (UV[k * 2] ?? 0) / 3;
        v += (UV[k * 2 + 1] ?? 0) / 3;
      });
      toneAt(tones, u, v, tone);
    }
    const k = tones ? tone : WHITE;
    const rgb: Vec3 = [
      toSrgb((m.colors[v0 * 3] ?? 1) * (k[0] ?? 1) * shade),
      toSrgb((m.colors[v0 * 3 + 1] ?? 1) * (k[1] ?? 1) * shade),
      toSrgb((m.colors[v0 * 3 + 2] ?? 1) * (k[2] ?? 1) * shade),
    ];
    const [a, b, c] = pts;
    if (a && b && c) tri(t, a, b, c, rgb, alpha, m.cutout ? tones : undefined);
  }
}

/** Blend the pixels `layer` drew (alpha = opacity) over `t`, taking their depth. */
function blendOver(t: Target, layer: Target): void {
  for (let i = 0; i < layer.depth.length; i++) {
    const o = i * 4;
    const a = (layer.px[o + 3] ?? 0) / 255;
    if (a === 0) continue;
    const under = ((t.px[o + 3] ?? 0) / 255) * (1 - a);
    const out = a + under;
    for (let k = 0; k < 3; k++)
      t.px[o + k] = Math.round(((layer.px[o + k] ?? 0) * a + (t.px[o + k] ?? 0) * under) / out);
    t.px[o + 3] = Math.round(out * 255);
    t.depth[i] = layer.depth[i] ?? Infinity;
  }
}

/**
 * Draw every part into `t`. `tones` (the trim sheet's mean albedo per strip) turns the form-only
 * render into the base-colour one: albedo × vertex colour, and see-through parts blended.
 */
export function drawAsset(t: Target, cam: Camera, asset: CompiledAsset, tones?: SheetTones): void {
  const parts = worldParts(asset);
  const through = tones ? parts.filter((m) => m.opacity !== undefined && !m.textured) : [];
  for (const m of parts) {
    if (m.textured) {
      const { set, part, cutout } = m.textured;
      drawTextured(t, cam, m, setTextures(set, part), cutout, LIGHT);
    } else if (!through.includes(m)) drawFlat(t, cam, m, tones, 255);
  }
  if (through.length === 0) return;
  // One nearest see-through layer in front of the opaque depth: independent of part order.
  const layer: Target = { ...t, px: new Uint8Array(t.px.length), depth: t.depth.slice() };
  for (const m of through)
    drawFlat(layer, cam, m, tones, Math.max(1, Math.round((m.opacity ?? 1) * 255)));
  blendOver(t, layer);
}

export function line(t: Target, a: Vec3, b: Vec3, rgb: Vec3): void {
  const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), 1));
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    const x = Math.round(a[0] + (b[0] - a[0]) * k);
    const y = Math.round(a[1] + (b[1] - a[1]) * k);
    if (x < 0 || y < 0 || x >= t.width || y >= t.height) continue;
    const z = a[2] + (b[2] - a[2]) * k;
    const i = y * t.width + x;
    if (z > (t.depth[i] ?? Infinity) + 1e-3) continue;
    t.px.set([rgb[0], rgb[1], rgb[2], 255], i * 4);
  }
}
