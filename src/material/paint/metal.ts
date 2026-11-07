// Bare and finished metal sheet (kind 'metal'): a continuous metallic base with polish mottling,
// then optional finishes, each a param in 0..1 — `brush` (fine streaks along U, brushed aluminium),
// `cast` (sand-cast pits and a rougher skin), `spangle` (galvanised zinc crystals), `oxide`
// (patches of rust / verdigris: blend to albedo2, dielectric, rough, slightly raised) and `paint`
// (a dielectric paint film over it whose `chips` reveal the oxidised metal). Rust runs down from
// the oxide (`streaks`).
// params: brush 0 · cast 0 · spangle 0 · oxide 0 · paint 0 · paintRough 0.45 · chips 0.25
//         crystal 0.03 (spangle size, m) · streaks 0

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { rustStreaks } from './masks.ts';
import { hash2 } from './noise.ts';
import type { StripRecipe } from './types.ts';

/** Nearest jittered grid point id on a `size` m lattice that wraps after `wrapU` metres. */
function crystal(xm: number, ym: number, size: number, cellsU: number, seed: number): number {
  const gx = Math.floor(xm / size);
  const gy = Math.floor(ym / size);
  let best = 1e9;
  let id = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = (((gx + i) % cellsU) + cellsU) % cellsU;
      const px = (gx + i + hash2(cx, gy + j, seed)) * size;
      const py = (gy + j + hash2(cx, gy + j, seed + 1)) * size;
      const d = (xm - px) ** 2 + (ym - py) ** 2;
      if (d < best) {
        best = d;
        id = hash2(cx, gy + j, seed + 2) * 1e6;
      }
    }
  return id;
}

export function paintMetal(c: Canvas, r: StripRecipe, seed: number): void {
  const p = r.params;
  const brush = param(p, 'brush', 0);
  const cast = param(p, 'cast', 0);
  const spangle = param(p, 'spangle', 0);
  const oxide = param(p, 'oxide', 0);
  const paint = param(p, 'paint', 0);
  const paintRough = param(p, 'paintRough', 0.45);
  const chips = param(p, 'chips', 0.25);
  const size = param(p, 'crystal', 0.03);
  const metal = r.metalness ?? 1;
  const cellsU = Math.max(1, Math.round(c.metresU / size));
  const cs = c.metresU / cellsU;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const big = noiseAt(c, xm, ym, 0.25, 0.25, seed, 4);
      const fine = noiseAt(c, xm, ym, 0.01, 0.01, seed + 1, 2);
      let tone = 1 + 0.05 * big;
      let rough = r.roughness + 0.06 * big + 0.03 * fine;
      let h = 0.00015 * big;
      if (brush > 0) {
        const s = noiseAt(c, xm, ym, 0.6, 0.002, seed + 2, 3);
        tone *= 1 + 0.06 * brush * s;
        rough += 0.08 * brush * s;
        h += 0.00003 * brush * s;
      }
      if (cast > 0) {
        const pit = noiseAt(c, xm, ym, 0.012, 0.012, seed + 3, 3);
        const lump = noiseAt(c, xm, ym, 0.08, 0.08, seed + 4, 3);
        h += cast * (0.0006 * pit + 0.0008 * lump);
        rough += cast * (0.1 + 0.12 * pit);
        tone *= 1 + cast * (0.16 * pit + 0.08 * lump - 0.04);
      }
      if (spangle > 0) {
        const k = crystal(xm, ym, cs, cellsU, seed + 5);
        const v = hash2(k, 7, seed) * 2 - 1;
        tone *= 1 + 0.12 * spangle * v;
        rough += 0.12 * spangle * v;
      }
      // Oxide: patchy, gathering in low-frequency blotches; dielectric, rough and a touch proud.
      let ox = 0;
      if (oxide > 0) {
        const blot = noiseAt(c, xm, ym, 0.18, 0.18, seed + 6, 5);
        const grain = noiseAt(c, xm, ym, 0.02, 0.02, seed + 7, 3);
        ox = smooth(0.45, 0.75, blot * 0.5 + 0.5 + oxide - 0.5 + 0.15 * grain);
        h += ox * 0.0004 * (1 + grain);
      }
      let m = metal * (1 - ox);
      let mix = ox;
      rough = rough * (1 - ox) + (0.88 + 0.06 * fine) * ox;
      if (paint > 0) {
        // Chips gather where the noise peaks; the film is everywhere else.
        const n = noiseAt(c, xm, ym, 0.05, 0.05, seed + 8, 4);
        const chip = smooth(0.42, 0.5, n * 0.5 + 0.5 - (1 - chips) * 0.5 + 0.1);
        const film = paint * (1 - chip);
        m *= 1 - film;
        mix = mix * (1 - film) + chip * paint;
        rough = rough * (1 - film) + (paintRough + 0.05 * big) * film;
        tone = tone * (1 - film) + (0.96 + 0.03 * big) * film;
        h -= chip * paint * 0.00015;
      }
      c.height[i] = h;
      c.tone[i] = tone;
      c.rough[i] = Math.min(1, Math.max(0, rough));
      c.metal[i] = Math.min(1, Math.max(0, m));
      c.mix[i] = mix;
    }
  }
  rustStreaks(c, param(p, 'streaks', 0), seed + 77);
}
