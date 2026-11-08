// Blueprint: ONE PNG that measures the asset. Side, front and top orthographic views at one shared
// scale on a metre grid (major 1 m / minor 0.1 m, adapting to the size), overall L × W × H
// dimension lines, every `real.measures` entry drawn between its parts with model vs spec (green
// within tolerance, red outside), declared joints marked, and a 1.8 m figure for scale. A 3/4 view
// and a legend (every measure and joint verdict) complete the sheet. Zero-GPU, deterministic.
//   ┌ SIDE -Y ─────────┬ FRONT +X ───────┐
//   ├ TOP (X aligned) ─┼ 3/4 FRONT ──────┤
//   └ legend: measures (model / spec / Δ), joints ┘

import { type CompiledAsset, encodePng, jointFit, type Vec3 } from '../core/index.ts';
import type { Canvas } from './blueprint-draw.ts';
import { legend, legendHeight } from './blueprint-legend.ts';
import { BAD, dimsFor, fmtM, measureResults, OK } from './blueprint-measures.ts';
import {
  type Box3,
  extentOf,
  gridSteps,
  INK,
  type JointMark,
  MARGIN,
  type OrthoView,
  orthoPanel,
  PAPER,
} from './blueprint-panel.ts';
import { drawText } from './font.ts';
import { drawAsset, line, orthoCamera, type Target } from './raster.ts';
import { bounds } from './sheet.ts';

export const BLUEPRINT_VIEWS: readonly OrthoView[] = [
  { label: 'SIDE -Y', dir: [0, 1, 0], up: [0, 0, 1], figure: 'side' },
  { label: 'FRONT +X', dir: [-1, 0, 0], up: [0, 0, 1], figure: 'front' },
  { label: 'TOP', dir: [0, 0, -1], up: [0, 1, 0], figure: 'top' },
];

export interface BlueprintOptions {
  /** Panel width in px (the sheet is two panels wide). Default 800. */
  readonly panel?: number;
  /** Joint verdicts, name → fits. Default: measured here with `jointFit` (as QA \`joints\` does). */
  readonly joints?: Readonly<Record<string, boolean>>;
}

/** The blueprint as a PNG. */
export const blueprint = (asset: CompiledAsset, o: BlueprintOptions = {}): Uint8Array => {
  const img = blueprintImage(asset, o);
  return encodePng(img.width, img.height, img.px);
};

/** The blueprint's RGBA pixels (tests and tools that post-process the image). */
export function blueprintImage(asset: CompiledAsset, o: BlueprintOptions = {}): Canvas {
  const pw = o.panel ?? 800;
  const ph = Math.round(pw * 0.7);
  const head = 52;
  const sb = bounds(asset);
  const box: Box3 = { min: sb.min, max: sb.max };
  const figure = sb.extent >= 0.3;
  const [mL, mR, mT, mB] = MARGIN;
  const fit = (v: OrthoView): number => {
    const [h0, h1, v0, v1] = extentOf(v, box, figure);
    return Math.min(
      (pw - mL - mR) / Math.max(h1 - h0, 1e-3),
      (ph - mT - mB) / Math.max(v1 - v0, 1e-3),
    );
  };
  // Side and top share one scale (X lines up between them); the front view fits its own panel.
  const k = Math.min(...BLUEPRINT_VIEWS.filter((v) => v.figure !== 'front').map(fit));
  const scaleOf = (v: OrthoView): number => (v.figure === 'front' ? fit(v) : k);
  const ms = measureResults(asset);
  const marks: JointMark[] = (asset.joints ?? []).map((j) => {
    const v = o.joints?.[j.name] ?? jointFit(asset, j).findings.length === 0;
    return { name: j.name, at: j.at, rgb: v ? OK : BAD };
  });
  const width = pw * 2;
  const foot = legendHeight(ms.length, marks.length, width);
  const height = head + ph * 2 + foot;
  const px = new Uint8Array(width * height * 4);
  const sheet: Canvas = { px, width, height };
  for (let i = 0; i < width * height; i++) px.set([...PAPER, 255], i * 4);
  const panels = [
    ...BLUEPRINT_VIEWS.map((view) =>
      orthoPanel({
        asset,
        view,
        box,
        k: scaleOf(view),
        width: pw,
        height: ph,
        figure,
        dims: dimsFor(view, box, ms),
        joints: marks,
      }),
    ),
    isoPanel(asset, pw, ph, sb.centre, sb.extent),
  ];
  panels.forEach((p, i) => {
    const ox = (i % 2) * pw;
    const oy = head + Math.floor(i / 2) * ph;
    for (let y = 0; y < ph; y++)
      px.set(p.px.subarray(y * pw * 4, (y + 1) * pw * 4), ((oy + y) * width + ox) * 4);
  });
  // Panel frames.
  for (let i = 0; i < width * 2; i++) {
    const x = i % width;
    for (const y of [head, head + ph, head + ph * 2 - 1])
      px.set([...INK, 255], (y * width + x) * 4);
  }
  for (let y = head; y < head + ph * 2; y++) px.set([...INK, 255], (y * width + pw) * 4);
  const title = `${asset.name}  BLUEPRINT  L ${fmtM(sb.max[0] - sb.min[0])} X W ${fmtM(sb.max[1] - sb.min[1])} X H ${fmtM(sb.max[2] - sb.min[2])} M  LOD${asset.lod}${figure ? '  FIGURE 1.8 M' : ''}`;
  drawText(px, width, 12, 14, title, 4, INK);
  legend(sheet, head + ph * 2, ms, marks);
  return sheet;
}

/** 3/4 front view with a ground grid, as on the contact sheet. */
function isoPanel(
  asset: CompiledAsset,
  pw: number,
  ph: number,
  centre: Vec3,
  extent: number,
): Canvas {
  const size = Math.max(pw, ph);
  const t: Target = {
    px: new Uint8Array(size * size * 4),
    depth: new Float32Array(size * size).fill(Infinity),
    width: size,
    height: size,
  };
  for (let i = 0; i < size * size; i++) t.px.set([...PAPER, 255], i * 4);
  const fit = (extent * size) / ph;
  const cam = orthoCamera({ label: '', dir: [-1, 0.8, -0.6], up: [0, 0, 1] }, centre, fit, size);
  const [minor, step] = gridSteps(size / (fit * 1.15));
  for (const [s, rgb] of [
    [minor, [222, 229, 238]],
    [step, [178, 192, 212]],
  ] as const) {
    const g0 = Math.floor((Math.min(centre[0], centre[1]) - extent) / s) * s;
    const g1 = Math.ceil((Math.max(centre[0], centre[1]) + extent) / s) * s;
    for (let g = g0; g <= g1 + 1e-9; g += s) {
      line(t, cam.project([g, g0, 0]), cam.project([g, g1, 0]), rgb);
      line(t, cam.project([g0, g, 0]), cam.project([g1, g, 0]), rgb);
    }
  }
  drawAsset(t, cam, asset);
  // Crop the square render to the panel, centred.
  const out = new Uint8Array(pw * ph * 4);
  const dx = Math.floor((size - pw) / 2);
  const dy = Math.floor((size - ph) / 2);
  for (let y = 0; y < ph; y++)
    out.set(t.px.subarray(((y + dy) * size + dx) * 4, ((y + dy) * size + dx + pw) * 4), y * pw * 4);
  const c: Canvas = { px: out, width: pw, height: ph };
  drawText(out, pw, 10, 10, `3/4 FRONT  GRID ${step} M`, 3, INK);
  return c;
}
