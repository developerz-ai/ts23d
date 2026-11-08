// One orthographic blueprint view: a metre grid in the view plane (minor/major lines adaptive to
// the drawing scale, ground line at z = 0), the shaded asset, the 1.8 m figure, overall dimension
// lines, the spec measures that read in this view (green within tolerance, red outside) and the
// declared joints. All views of one sheet share one scale, so they compare side by side.

import { type CompiledAsset, cross, normalize, type Vec3 } from '../core/index.ts';
import { type Canvas, dimension, fillRect, label, type Rgb, ring, seg } from './blueprint-draw.ts';
import { type FigureView, HUMAN_HALF, HUMAN_HEIGHT, human } from './blueprint-human.ts';
import { drawText } from './font.ts';
import { drawAsset, type Target } from './raster.ts';

export interface OrthoView {
  readonly label: string;
  readonly dir: Vec3;
  readonly up: Vec3;
  readonly figure: FigureView;
}

/** A dimension to draw: world end points, the axis it measures, its text and colour. */
export interface DimSpec {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly axis: 0 | 1 | 2;
  readonly text: string;
  readonly rgb: Rgb;
  /** The measured parts' box: the dimension stands off below it (horizontal) or right of it. */
  readonly box: Box3;
}

export interface JointMark {
  readonly name: string;
  readonly at: Vec3;
  readonly rgb: Rgb;
}

export interface Box3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

export const PAPER: Rgb = [247, 249, 252];
export const INK: Rgb = [28, 46, 74];
const MINOR: Rgb = [210, 220, 234];
const MAJOR: Rgb = [142, 162, 192];
const GROUND: Rgb = [92, 104, 122];
/** Panel margins (px): left, right, top, bottom — room for labels and dimension lines. */
export const MARGIN = [24, 120, 44, 64] as const;

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function axesOf(v: OrthoView): { r: Vec3; u: Vec3; f: Vec3 } {
  const f = normalize(v.dir);
  const r = normalize(cross(f, v.up));
  return { r, u: cross(r, f), f };
}

/** World axis index a view vector lies along, or -1 (an oblique view). */
const axisOf = (v: Vec3): number => v.findIndex((x) => Math.abs(x) > 0.99);

/** The view-plane extent (h, v ranges, metres) of the asset box plus the scale figure. */
export function extentOf(
  view: OrthoView,
  b: Box3,
  withFigure: boolean,
): [number, number, number, number] {
  const { r, u } = axesOf(view);
  const hs: number[] = [];
  const vs: number[] = [];
  for (let i = 0; i < 8; i++) {
    const p: Vec3 = [
      i & 1 ? b.max[0] : b.min[0],
      i & 2 ? b.max[1] : b.min[1],
      i & 4 ? b.max[2] : b.min[2],
    ];
    hs.push(dot3(p, r));
    vs.push(dot3(p, u));
  }
  let [h0, h1, v0, v1] = [Math.min(...hs), Math.max(...hs), Math.min(...vs), Math.max(...vs)];
  if (withFigure) {
    h0 -= figureGap(h1 - h0) + HUMAN_HALF[view.figure] * 2;
    if (view.figure !== 'top') {
      v0 = Math.min(v0, 0);
      v1 = Math.max(v1, HUMAN_HEIGHT);
    } else {
      v0 = Math.min(v0, -0.25);
      v1 = Math.max(v1, 0.25);
    }
  }
  return [h0, h1, v0, v1];
}

const figureGap = (span: number): number => Math.max(0.3, span * 0.08);

export function gridSteps(k: number): [number, number] {
  const minor = [0.001, 0.01, 0.1, 1, 10, 100].find((s) => s * k >= 7) ?? 100;
  return [minor, minor * 10];
}

export interface PanelInput {
  readonly asset: CompiledAsset;
  readonly view: OrthoView;
  readonly box: Box3;
  readonly k: number;
  readonly width: number;
  readonly height: number;
  readonly figure: boolean;
  readonly dims: readonly DimSpec[];
  readonly joints: readonly JointMark[];
}

export function orthoPanel(o: PanelInput): Canvas {
  const { r, u, f } = axesOf(o.view);
  const [h0, h1, v0, v1] = extentOf(o.view, o.box, o.figure);
  const [mL, mR, mT, mB] = MARGIN;
  const ch = (h0 + h1) / 2;
  const cv = (v0 + v1) / 2;
  const ox = mL + (o.width - mL - mR) / 2;
  const oy = mT + (o.height - mT - mB) / 2;
  const toPx = (h: number, v: number): [number, number] => [
    ox + (h - ch) * o.k,
    oy - (v - cv) * o.k,
  ];
  const at = (p: Vec3): [number, number] => toPx(dot3(p, r), dot3(p, u));
  const t: Target = {
    px: new Uint8Array(o.width * o.height * 4),
    depth: new Float32Array(o.width * o.height).fill(Infinity),
    width: o.width,
    height: o.height,
  };
  const c: Canvas = { px: t.px, width: o.width, height: o.height, taken: [[0, 0, 470, 34]] };
  fillRect(c, 0, 0, o.width, o.height, PAPER);
  grid(c, o.k, ch, cv, ox, oy);
  if (o.view.figure !== 'top') {
    const [, gy] = toPx(0, 0);
    seg(c, 0, gy, o.width, gy, GROUND, 2);
  }
  if (o.figure) {
    const [a0, a1] = extentOf(o.view, o.box, false);
    const fh = a0 - figureGap(a1 - a0) - HUMAN_HALF[o.view.figure];
    human(c, toPx, o.view.figure, fh, o.view.figure === 'top' ? (v0 + v1) / 2 : 0);
  }
  drawAsset(t, { project: (p) => [...at(p), dot3(p, f)] }, o.asset);
  o.dims.forEach((d, i) => {
    drawDim(c, d, r, u, at, i);
  });
  for (const j of o.joints) {
    const [x, y] = at(j.at);
    ring(c, x, y, 7, j.rgb, 2);
    seg(c, x - 11, y, x + 11, y, j.rgb, 1);
    seg(c, x, y - 11, x, y + 11, j.rgb, 1);
    label(c, x + 14 + j.name.length * 4, y - 12, j.name, j.rgb, PAPER);
  }
  const [minor, major] = gridSteps(o.k);
  drawText(c.px, o.width, 10, 10, `${o.view.label}  GRID ${major} M / ${minor} M`, 3, INK);
  return c;
}

function grid(c: Canvas, k: number, ch: number, cv: number, ox: number, oy: number): void {
  const [minor, major] = gridSteps(k);
  const hL = ch - ox / k;
  const hR = ch + (c.width - ox) / k;
  const vT = cv + oy / k;
  const vB = cv - (c.height - oy) / k;
  for (const [step, rgb] of [
    [minor, MINOR],
    [major, MAJOR],
  ] as const) {
    for (let i = Math.ceil(hL / step); i * step <= hR; i++) {
      const x = ox + (i * step - ch) * k;
      seg(c, x, 0, x, c.height, rgb);
    }
    for (let i = Math.ceil(vB / step); i * step <= vT; i++) {
      const y = oy - (i * step - cv) * k;
      seg(c, 0, y, c.width, y, rgb);
    }
  }
}

function drawDim(
  c: Canvas,
  d: DimSpec,
  r: Vec3,
  u: Vec3,
  at: (p: Vec3) => [number, number],
  i: number,
): void {
  const horizontal = axisOf(r) === d.axis;
  if (!horizontal && axisOf(u) !== d.axis) return;
  const pa = at(d.a);
  const pb = at(d.b);
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((n) =>
    at([
      n & 1 ? d.box.max[0] : d.box.min[0],
      n & 2 ? d.box.max[1] : d.box.min[1],
      n & 4 ? d.box.max[2] : d.box.min[2],
    ]),
  );
  // Stand-off: horizontal dims below the box, vertical ones right of it, staggered.
  const gap = 22 + (i % 4) * 18;
  if (horizontal) {
    const y = Math.max(...corners.map((p) => p[1])) + gap;
    dimension(c, pa, pb, [0, y - pa[1]], d.text, d.rgb);
  } else {
    const x = Math.max(...corners.map((p) => p[0])) + gap;
    dimension(c, pa, pb, [x - pa[0], 0], d.text, d.rgb);
  }
}
