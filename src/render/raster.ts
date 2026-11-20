// CPU rasteriser: orthographic, z-buffered, Lambert-shaded triangles plus depth-tested lines.
// Slow by GPU standards and fast enough for 6 × 400² views of a game asset in well under a second.
// Shaded per pixel as an engine does (raster-shade.ts, D450–D452): interpolated vertex colour and
// smooth normal, times the trim sheet's albedo sampled under the pixel's UV when the caller passes
// `tones` (sheet-tones.ts), so a white-tinted oak plank is brown as in the hero. With tones,
// see-through parts (glass, ice, liquid…) are drawn last as one nearest transmissive layer over
// what is behind (raster-glass.ts, D453); without, every part is opaque, the form-only render.
// Cutout cards on the sheet (leaves, needles, fur) are alpha-tested per pixel against the sheet's
// texels (D300); that needs `tones` too. Parts with their own texture set (ADR 016) are drawn per
// pixel by raster-textured.ts.

import type { CompiledAsset, Vec3 } from '../core/index.ts';
import { cross, dmath, dot, scale, sub } from '../core/index.ts';
import { drawGlass } from './raster-glass.ts';
import { drawSmooth } from './raster-shade.ts';
import { drawTextured } from './raster-textured.ts';
import type { SheetTones } from './sheet-tones.ts';
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

/** `v` at unit length (zero stays zero), by dmath: the same bits on every CPU. */
export const unit = (v: Vec3): Vec3 => {
  const l = dmath.hypot(v[0], v[1], v[2]);
  return l === 0 ? [0, 0, 0] : scale(v, 1 / l);
};

export function orthoCamera(view: View, centre: Vec3, extent: number, size: number): Camera {
  const f = unit(view.dir);
  const r = unit(cross(f, view.up));
  const u = cross(r, f);
  const k = size / (extent * 1.15);
  return {
    project: (p) => {
      const d = sub(p, centre);
      return [size / 2 + dot(d, r) * k, size / 2 - dot(d, u) * k, dot(d, f)];
    },
  };
}

const LIGHT = unit([0.4, -0.6, 0.8]);

/**
 * Draw every part into `t`. `tones` (the trim sheet's mean albedo per strip) turns the form-only
 * render into the base-colour one: albedo × vertex colour, and see-through parts transmissive.
 */
export function drawAsset(t: Target, cam: Camera, asset: CompiledAsset, tones?: SheetTones): void {
  const parts = worldParts(asset);
  const through = tones ? parts.filter((m) => m.opacity !== undefined && !m.textured) : [];
  for (const m of parts) {
    if (m.textured) {
      const { set, part, cutout } = m.textured;
      drawTextured(t, cam, m, setTextures(set, part), cutout, LIGHT);
    } else if (!through.includes(m)) drawSmooth(t, cam, m, tones, LIGHT);
  }
  // One nearest see-through layer in front of the opaque depth: independent of part order.
  if (tones && through.length > 0) drawGlass(t, cam, through, tones, LIGHT);
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
