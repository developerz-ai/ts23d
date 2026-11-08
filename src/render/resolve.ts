// Resolve the supersampled visibility buffer to output pixels, MSAA-style: samples in a pixel
// that hit the same triangle are shaded ONCE at their mean barycentrics and weighted by count, so
// edges get ss² coverage samples while interiors cost one shade. Background samples show the
// studio backdrop × the floor's shadow light. See-through samples add what lies behind them (the
// opaque-only buffer, refraction-offset) × their transmitted tint. Also yields the coverage mask
// and a detail grid.

import type { FloorGrid } from './ground.ts';
import { floorLight } from './ground.ts';
import { fromSrgb, tone, toSrgb8 } from './lighting.ts';
import { type ShadeContext, shadeSample } from './shade.ts';
import type { VisBuffer } from './vis-buffer.ts';

export interface Resolved {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly mask: Uint8Array;
  readonly detail: Uint32Array;
}

/** Backdrop colour (linear) at normalised screen (nx, ny): soft radial falloff below centre. */
function backdrop(nx: number, ny: number, out: Float32Array): void {
  const dx = (nx - 0.5) * 1.1;
  const dy = ny - 0.62;
  const fall = Math.min(1, dx * dx + dy * dy * 1.6);
  out[0] = fromSrgb(0.93 - 0.17 * fall);
  out[1] = fromSrgb(0.935 - 0.15 * fall);
  out[2] = fromSrgb(0.94 - 0.12 * fall);
}

/** Linear radiance behind supersampled pixel (X, Y): the opaque buffer, else backdrop × floor. */
function behindAt(
  ctx: ShadeContext,
  floor: FloorGrid,
  X: number,
  Y: number,
  out: Float32Array,
  bg: Float32Array,
): void {
  const b = ctx.behind;
  const W = ctx.cam.width;
  const H = ctx.cam.height;
  const x = Math.max(0, Math.min(W - 1, Math.round(X)));
  const y = Math.max(0, Math.min(H - 1, Math.round(Y)));
  const i = y * W + x;
  const t = b?.tri[i] ?? -1;
  if (b && t >= 0) {
    shadeSample(ctx, t, b.b1[i] ?? 0, b.b2[i] ?? 0, b.mip[t] ?? 0, x + y * 2, out);
    return;
  }
  backdrop(x / W, y / H, bg);
  const l = floorLight(floor, ctx.cam, x + 0.5, y + 0.5);
  out[0] = (bg[0] ?? 0) * l;
  out[1] = (bg[1] ?? 0) * l;
  out[2] = (bg[2] ?? 0) * l;
}

export function resolve(
  ctx: ShadeContext,
  vis: VisBuffer,
  floor: FloorGrid,
  width: number,
  height: number,
  ss: number,
): Resolved {
  const rgba = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height);
  // Last detail cell each triangle was counted in: ≈ distinct triangles per cell, no hash set.
  const counted = new Int32Array(ctx.scene.triangles).fill(-1);
  const detail = new Uint32Array(16 * 9);
  const lin = new Float32Array(3);
  const bg = new Float32Array(3);
  const thru = new Float32Array(5);
  const back = new Float32Array(3);
  const bg2 = new Float32Array(3);
  const n = ss * ss;
  const ids = new Int32Array(n);
  const cnt = new Int32Array(n);
  const sb1 = new Float64Array(n);
  const sb2 = new Float64Array(n);
  const W = vis.width;
  const inv = 1 / n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      backdrop(x / width, y / height, bg);
      let r = 0;
      let g = 0;
      let b = 0;
      let groups = 0;
      let hits = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const X = x * ss + sx;
          const Y = y * ss + sy;
          const i = Y * W + X;
          const t = vis.tri[i] ?? -1;
          if (t < 0) {
            const l = floorLight(floor, ctx.cam, X + 0.5, Y + 0.5);
            r += (bg[0] ?? 0) * l;
            g += (bg[1] ?? 0) * l;
            b += (bg[2] ?? 0) * l;
            continue;
          }
          hits++;
          let k = 0;
          while (k < groups && ids[k] !== t) k++;
          if (k === groups) {
            ids[k] = t;
            cnt[k] = 0;
            sb1[k] = 0;
            sb2[k] = 0;
            groups++;
          }
          cnt[k] = (cnt[k] ?? 0) + 1;
          sb1[k] = (sb1[k] ?? 0) + (vis.b1[i] ?? 0);
          sb2[k] = (sb2[k] ?? 0) + (vis.b2[i] ?? 0);
        }
      const cell = Math.floor((y * 9) / height) * 16 + Math.floor((x * 16) / width);
      for (let k = 0; k < groups; k++) {
        const t = ids[k] ?? 0;
        const c = cnt[k] ?? 1;
        if (counted[t] !== cell) {
          counted[t] = cell;
          detail[cell] = (detail[cell] ?? 0) + 1;
        }
        const see =
          ctx.behind !== undefined &&
          (ctx.scene.looks[ctx.scene.look[t] ?? 0]?.transmission ?? 0) > 0;
        shadeSample(
          ctx,
          t,
          (sb1[k] ?? 0) / c,
          (sb2[k] ?? 0) / c,
          vis.mip[t] ?? 0,
          x + y * 2,
          lin,
          see ? thru : undefined,
        );
        if (see) {
          behindAt(
            ctx,
            floor,
            (x + 0.5) * ss + (thru[3] ?? 0),
            (y + 0.5) * ss + (thru[4] ?? 0),
            back,
            bg2,
          );
          for (let q = 0; q < 3; q++) lin[q] = (lin[q] ?? 0) + (thru[q] ?? 0) * (back[q] ?? 0);
        }
        r += tone(lin[0] ?? 0) * c;
        g += tone(lin[1] ?? 0) * c;
        b += tone(lin[2] ?? 0) * c;
      }
      const o = (y * width + x) * 4;
      rgba[o] = toSrgb8(r * inv);
      rgba[o + 1] = toSrgb8(g * inv);
      rgba[o + 2] = toSrgb8(b * inv);
      rgba[o + 3] = 255;
      mask[y * width + x] = Math.round(hits * inv * 255);
    }
  }
  return { width, height, rgba, mask, detail };
}
