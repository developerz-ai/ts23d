// Rasteriser for foliage cells: tapered stems and leaf shapes composited back-to-front into
// linear colour + coverage, with leaf-dome and midrib relief. `finish` writes sRGB RGBA (alpha =
// leaf mask, transparent texels bled with leaf colour so mips don't halo), height, roughness and
// an occlusion term that darkens toward the twig axis. Shapes iterate only their pixel bounds.

import { type Canvas, clamp01, smooth } from './canvas.ts';
import { SRGB } from './orm.ts';
import { segment } from './shapes.ts';

export type Rgb = readonly [number, number, number];
/** Width profile of a leaf along its length t ∈ [0, 1]; 1 = full half-width. */
export type LeafShape = 'ovate' | 'lance' | 'needle' | 'blade' | 'palmate';

const total = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);

/** Angle between palmate lobe axes. */
const LOBE = (Math.PI * 2) / 5;

export class Foliage {
  private readonly r: Float32Array;
  private readonly g: Float32Array;
  private readonly b: Float32Array;
  private readonly a: Float32Array;
  private readonly c: Canvas;
  private readonly px: number;

  constructor(c: Canvas) {
    this.c = c;
    const n = c.w * c.h;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.a = new Float32Array(n);
    this.px = c.metresU / c.w;
    c.height.fill(0);
  }

  /** Composite `cov` of colour (cr, cg, cb) × shade over texel i. */
  private put(i: number, cov: number, col: Rgb, shade: number, h: number, rough: number): void {
    if (cov <= 0) return;
    const k = 1 - cov;
    const s = shade * cov;
    this.r[i] = (this.r[i] ?? 0) * k + col[0] * s;
    this.g[i] = (this.g[i] ?? 0) * k + col[1] * s;
    this.b[i] = (this.b[i] ?? 0) * k + col[2] * s;
    this.a[i] = (this.a[i] ?? 0) * k + cov;
    this.c.height[i] = (this.c.height[i] ?? 0) * k + h * cov;
    this.c.rough[i] = (this.c.rough[i] ?? 0.8) * k + rough * cov;
  }

  /** Pixel bounds of a metre-space box, clipped to the canvas. */
  private span(x0: number, y0: number, x1: number, y1: number): readonly number[] {
    const { w, h } = this.c;
    const p = this.px;
    return [
      Math.max(0, Math.floor(x0 / p) - 1),
      Math.max(0, Math.floor(y0 / p) - 1),
      Math.min(w - 1, Math.ceil(x1 / p) + 1),
      Math.min(h - 1, Math.ceil(y1 / p) + 1),
    ];
  }

  /** A tapered stem / twig / rachis from (ax, ay) width w0 to (bx, by) width w1, metres. */
  stem(ax: number, ay: number, bx: number, by: number, w0: number, w1: number, col: Rgb): void {
    const m = Math.max(w0, w1);
    const [sx0 = 0, sy0 = 0, sx1 = 0, sy1 = 0] = this.span(
      Math.min(ax, bx) - m,
      Math.min(ay, by) - m,
      Math.max(ax, bx) + m,
      Math.max(ay, by) + m,
    );
    const lx = bx - ax;
    const ly = by - ay;
    const l2 = lx * lx + ly * ly || 1;
    for (let y = sy0; y <= sy1; y++) {
      const ym = (y + 0.5) * this.px;
      for (let x = sx0; x <= sx1; x++) {
        const xm = (x + 0.5) * this.px;
        const t = clamp01(((xm - ax) * lx + (ym - ay) * ly) / l2);
        const half = (w0 + (w1 - w0) * t) / 2;
        const d = segment(xm, ym, ax, ay, bx, by);
        const cov = clamp01(0.5 - (d - half) / this.px);
        const round = half > 0 ? Math.sqrt(Math.max(0, 1 - (d / half) ** 2)) : 0;
        this.put(y * this.c.w + x, cov, col, 1, 0.0015 + half * 0.4 * round, 0.85);
      }
    }
  }

  /**
   * A leaf from its base (bx, by) along `angle` (radians, 0 = +V, positive = toward +U), `len`
   * long and `wid` wide at its widest. `serrate` adds teeth; `lift` raises it over earlier layers.
   */
  leaf(
    shape: LeafShape,
    bx: number,
    by: number,
    angle: number,
    len: number,
    wid: number,
    col: Rgb,
    serrate = 0,
    lift = 0,
  ): void {
    const ux = Math.sin(angle);
    const uy = Math.cos(angle);
    // Bounds: the base-to-tip segment padded by the half-width (palmate: the whole blade disc).
    const tx = bx + ux * len;
    const ty = by + uy * len;
    const pad = shape === 'palmate' ? len : wid;
    const [sx0 = 0, sy0 = 0, sx1 = 0, sy1 = 0] = this.span(
      Math.min(bx, tx) - pad,
      Math.min(by, ty) - pad,
      Math.max(bx, tx) + pad,
      Math.max(by, ty) + pad,
    );
    for (let y = sy0; y <= sy1; y++) {
      const ym = (y + 0.5) * this.px - by;
      for (let x = sx0; x <= sx1; x++) {
        const xm = (x + 0.5) * this.px - bx;
        const along = xm * ux + ym * uy;
        const across = xm * uy - ym * ux;
        let sd: number;
        let rib: number;
        if (shape === 'palmate') {
          // Five pointed lobes around the petiole tip; notch at the stem side.
          const rr = Math.hypot(along - len * 0.45, across);
          const th = Math.atan2(across, along - len * 0.45);
          const lobe = 1 - Math.abs(Math.sin(2.5 * th)) ** 0.6;
          const edge =
            len * 0.5 * (0.35 + 0.65 * lobe) * (1 + serrate * Math.abs(Math.sin(18 * th)));
          sd = rr - edge;
          const axis = Math.round(th / LOBE) * LOBE;
          rib = rr * Math.abs(Math.sin(th - axis));
        } else {
          const t = along / len;
          if (t < 0 || t > 1) {
            sd = Math.max(-along, along - len) + Math.abs(across) * 0.5;
          } else {
            const prof =
              shape === 'ovate'
                ? Math.sin(Math.PI * t ** 0.8) ** 0.9
                : shape === 'lance'
                  ? Math.sin(Math.PI * t ** 0.6)
                  : shape === 'blade'
                    ? (1 - t) ** 0.4
                    : 1 - 0.6 * t;
            const teeth = 1 - serrate * Math.abs(Math.sin(t * 40));
            sd = Math.abs(across) - (wid / 2) * prof * teeth;
          }
          rib = Math.abs(across);
        }
        const cov = clamp01(0.5 - sd / this.px);
        if (cov <= 0) continue;
        const inside = clamp01(-sd / (wid * 0.5 + 1e-6));
        const vein = 1 - smooth(0, this.px * 1.5, rib);
        const shade = 0.85 + 0.15 * inside;
        this.put(
          y * this.c.w + x,
          cov,
          col,
          shade,
          0.002 + lift + 0.0015 * inside + 0.0006 * vein,
          0.6,
        );
      }
    }
  }

  /** Write the layers to the canvas: sRGB RGBA with bled colour, occlusion toward the twig. */
  finish(axisX = 0.5, reach = 0.35): void {
    const { w, h } = this.c;
    const n = w * h;
    const sa = total(this.a);
    const mean: Rgb =
      sa > 0 ? [total(this.r) / sa, total(this.g) / sa, total(this.b) / sa] : [0.1, 0.2, 0.05];
    const out = new Uint8Array(n * 4);
    const enc = (v: number): number => SRGB[Math.round(clamp01(v) * 4095)] ?? 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = this.a[i] ?? 0;
        // Un-premultiply; transparent texels take the mean leaf colour (mip-safe bleed).
        const k = a > 0.02 ? 1 / a : 0;
        const mix = clamp01(a * 4);
        out[i * 4] = enc((this.r[i] ?? 0) * k * mix + mean[0] * (1 - mix));
        out[i * 4 + 1] = enc((this.g[i] ?? 0) * k * mix + mean[1] * (1 - mix));
        out[i * 4 + 2] = enc((this.b[i] ?? 0) * k * mix + mean[2] * (1 - mix));
        out[i * 4 + 3] = Math.round(clamp01(a) * 255);
        const d = Math.abs((x + 0.5) * this.px - axisX);
        this.c.occl[i] = 0.55 + 0.45 * smooth(0, reach, d + (y + 0.5) * this.px * 0.4);
      }
    }
    this.c.rgba = out;
    this.c.metal.fill(0);
  }
}
