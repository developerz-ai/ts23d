// Rectangular decal cells (1 m each), painted over a backdrop of the cell recipe's own kind:
// window sash (glazing bars, dark panes the shaders' window glow keys on), four-panel door with
// raised-and-fielded panels, sign blank with a moulded border and corner screws. Row y grows with
// world up, so "bottom rail" is low y.
// params (window_sash): cols 2 · rows 2 (panes per sash) · frame 0.07 · bar 0.022
// params (door_panel): stile 0.12

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { dome, rect } from './shapes.ts';
import type { StripRecipe } from './types.ts';

/** Pane tone: dark enough that `luma < 0.3` marks glass for window glow. */
export const PANE_TONE = 0.12;

export function paintWindowSash(c: Canvas, r: StripRecipe, seed: number): void {
  const cols = param(r.params, 'cols', 2);
  const rows = param(r.params, 'rows', 2);
  const frame = param(r.params, 'frame', 0.07);
  const bar = param(r.params, 'bar', 0.022);
  const meet = 0.5;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const lower = ym < meet;
    const y0 = lower ? frame : meet + bar;
    const y1 = lower ? meet - bar : 1 - frame;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const i = y * c.w + x;
      // Distance into a pane: inside the sash opening, away from every glazing bar.
      const fx = ((xm - frame) / (1 - 2 * frame)) * cols;
      const fy = ((ym - y0) / (y1 - y0)) * rows;
      const inX = Math.min(fx - Math.floor(fx), Math.ceil(fx) - fx) * ((1 - 2 * frame) / cols);
      const inY = Math.min(fy - Math.floor(fy), Math.ceil(fy) - fy) * ((y1 - y0) / rows);
      const open = -rect(xm, ym, frame, y0, 1 - frame, y1);
      const pane = Math.min(open, inX - bar / 2, inY - bar / 2);
      const wood = noiseAt(c, xm, ym, 0.3, 0.02, seed, 3);
      if (pane > 0) {
        const sky = noiseAt(c, xm, ym, 0.6, 0.6, seed + 1, 2);
        c.height[i] = -0.012;
        c.tone[i] = PANE_TONE + 0.05 * (ym - y0) + 0.03 * sky;
        c.rough[i] = 0.05;
        c.metal[i] = 0;
      } else {
        const bevel = smooth(0, 0.01, -pane);
        c.height[i] = -0.012 * (1 - bevel) + 0.0003 * wood;
        c.tone[i] = 0.9 + 0.03 * wood;
        c.rough[i] = r.roughness;
      }
    }
  }
}

export function paintDoorPanel(c: Canvas, r: StripRecipe, seed: number): void {
  const stile = param(r.params, 'stile', 0.12);
  const muntin = stile * 0.7;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  // Four panels: two tall above the lock rail, two short below. [x0, y0, x1, y1].
  const midX = 0.5;
  const panels = [
    [stile, 0.2, midX - muntin / 2, 0.42],
    [midX + muntin / 2, 0.2, 1 - stile, 0.42],
    [stile, 0.58, midX - muntin / 2, 1 - stile],
    [midX + muntin / 2, 0.58, 1 - stile, 1 - stile],
  ] as const;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const i = y * c.w + x;
      let d = 1;
      for (const [x0, y0, x1, y1] of panels) d = Math.min(d, rect(xm, ym, x0, y0, x1, y1));
      const grain = noiseAt(c, xm, ym, 0.02, 0.4, seed, 3);
      // Recess, then a bevel rising to the raised field 0.04 m in from the panel edge.
      const recess = d < 0 ? 1 : 1 - smooth(0, 0.006, d);
      const field = smooth(0.005, 0.04, -d);
      c.height[i] = -0.012 * recess + 0.008 * field + 0.0003 * grain;
      c.tone[i] = (0.8 + 0.08 * grain) * (d < 0 && d > -0.008 ? 0.65 : d < 0 ? 0.92 : 1);
      c.rough[i] = r.roughness + 0.05 * grain;
    }
  }
}

export function paintSign(c: Canvas, r: StripRecipe, _seed: number): void {
  const border = param(r.params, 'border', 0.05);
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const screws = [0.07, 0.93];
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const i = y * c.w + x;
      const inner = -rect(xm, ym, border, border, 1 - border, 1 - border);
      const edge = Math.min(xm, ym, 1 - xm, 1 - ym);
      const moulding = inner < 0 ? dome(Math.abs(-inner - border / 2), border / 2) : 0;
      let screw = 0;
      for (const sx of screws)
        for (const sy of screws) screw = Math.max(screw, dome(Math.hypot(xm - sx, ym - sy), 0.012));
      c.height[i] = 0.006 * moulding + 0.002 * screw - 0.002 * (1 - smooth(0, 0.004, edge));
      c.tone[i] = inner > 0 ? 0.95 : 0.85 + 0.1 * moulding;
      if (screw > 0) {
        c.tone[i] = 0.6;
        c.metal[i] = 1;
        c.rough[i] = 0.35;
      }
    }
  }
}
