// Round decal cells (1 m each), centred, over the cell recipe's backdrop: station clock (bezel,
// minute and hour ticks, hands at 10:10), locomotive smokebox door (flanged, bolted rim, hinge
// straps, centre dart with handle), porthole (bolted brass ring, dark glass). Row y grows with
// world up, so 12 o'clock is +y.

import { type Canvas, noiseAt, smooth } from './canvas.ts';
import { PANE_TONE } from './cells.ts';
import { boltRing, dome, segment } from './shapes.ts';
import type { StripRecipe } from './types.ts';

const TAU = Math.PI * 2;

/** Hand from the centre at clock position `hours` (0..12), length `len`. */
function hand(px: number, py: number, hours: number, len: number): number {
  const a = (hours / 12) * TAU;
  return segment(px, py, 0, 0, Math.sin(a) * len, Math.cos(a) * len);
}

export function paintClock(c: Canvas, r: StripRecipe, _seed: number): void {
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const py = (y + 0.5) * pv - 0.5;
    for (let x = 0; x < c.w; x++) {
      const px = (x + 0.5) * pu - 0.5;
      const i = y * c.w + x;
      const d = Math.hypot(px, py);
      if (d > 0.48) continue;
      const i0 = i;
      if (d > 0.42) {
        c.height[i0] = 0.012 * dome(Math.abs(d - 0.45), 0.03);
        c.tone[i0] = 0.55;
        c.metal[i0] = 1;
        c.rough[i0] = 0.35;
        continue;
      }
      const a = Math.atan2(px, py);
      const minute = Math.abs((((a / TAU) * 60 + 60.5) % 1) - 0.5) * (TAU / 60) * d;
      const hour = Math.abs((((a / TAU) * 12 + 12.5) % 1) - 0.5) * (TAU / 12) * d;
      const tickM = d > 0.38 && d < 0.41 && minute < 0.003 ? 1 : 0;
      const tickH = d > 0.32 && d < 0.41 && hour < 0.008 ? 1 : 0;
      const hands = Math.min(
        hand(px, py, 10 + 10 / 60, 0.22) - 0.012,
        hand(px, py, 2, 0.34) - 0.007,
      );
      const ink = Math.max(tickM, tickH, hands < 0 ? 1 : 0, d < 0.02 ? 1 : 0);
      c.height[i0] = -0.004 + 0.002 * ink;
      c.tone[i0] = ink ? 0.08 : 0.96;
      c.rough[i0] = ink ? 0.5 : r.roughness;
      c.metal[i0] = 0;
    }
  }
}

export function paintSmokebox(c: Canvas, r: StripRecipe, seed: number): void {
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const metal = r.metalness ?? 0;
  for (let y = 0; y < c.h; y++) {
    const py = (y + 0.5) * pv - 0.5;
    for (let x = 0; x < c.w; x++) {
      const px = (x + 0.5) * pu - 0.5;
      const i = y * c.w + x;
      const d = Math.hypot(px, py);
      if (d > 0.47) continue;
      const pit = noiseAt(c, px + 0.5, py + 0.5, 0.03, 0.03, seed, 3);
      // Slightly dished door, a raised flange, a bolt ring just inside it.
      let h = 0.01 * (1 - (d / 0.47) ** 2) + 0.0004 * pit;
      const flange = dome(Math.abs(d - 0.45), 0.02);
      h += 0.006 * flange;
      const bolt = dome(boltRing(px, py, 0.415, 28), 0.011);
      h += 0.006 * bolt;
      // Two hinge straps from the left rim to the dart's line, ending in a rounded tip.
      const strap = Math.min(
        segment(px, py, -0.47, 0.17, 0.12, 0.17),
        segment(px, py, -0.47, -0.17, 0.12, -0.17),
      );
      const strapH = smooth(0.024, 0.018, strap);
      h = Math.max(h, 0.014 * strapH + h * (1 - strapH));
      const boss = dome(d, 0.05);
      const handle = smooth(0.012, 0.008, segment(px, py, -0.13, 0, 0.13, 0));
      h += 0.02 * boss + 0.012 * handle;
      c.height[i] = h;
      c.tone[i] =
        (0.5 + 0.05 * pit) * (1 + 0.5 * Math.max(bolt, handle, strapH * 0.6, flange, boss));
      c.rough[i] = r.roughness - 0.15 * Math.max(bolt, handle, boss);
      c.metal[i] = metal + (1 - metal) * Math.max(handle, boss) * 0.8;
    }
  }
}

export function paintPorthole(c: Canvas, r: StripRecipe, seed: number): void {
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const py = (y + 0.5) * pv - 0.5;
    for (let x = 0; x < c.w; x++) {
      const px = (x + 0.5) * pu - 0.5;
      const i = y * c.w + x;
      const d = Math.hypot(px, py);
      if (d > 0.44) continue;
      if (d < 0.29) {
        const sky = noiseAt(c, px + 0.5, py + 0.5, 0.5, 0.5, seed, 2);
        c.height[i] = -0.012;
        c.tone[i] = PANE_TONE + 0.04 * (py + 0.3) + 0.02 * sky;
        c.rough[i] = 0.05;
        c.metal[i] = 0;
        continue;
      }
      const ring = dome(Math.abs(d - 0.365), 0.075);
      const bolt = dome(boltRing(px, py, 0.405, 10, Math.PI / 10), 0.018);
      const lip = dome(Math.abs(d - 0.3), 0.012);
      c.height[i] = 0.016 * ring + 0.008 * bolt + 0.004 * lip;
      c.tone[i] = 0.75 + 0.15 * ring;
      c.rough[i] = Math.max(0.2, r.roughness - 0.2 * ring);
      c.metal[i] = 1;
    }
  }
}
