// Bare and finished metal sheet (kind 'metal'): a continuous metallic base with polish mottling,
// then optional finishes, each a param in 0..1 — `brush` (fine streaks along U, brushed aluminium),
// `cast` (sand-cast pits and a rougher skin), `spangle` (galvanised zinc crystals), `oxide`
// (patches of rust / verdigris: blend to albedo2, dielectric, rough, slightly raised) and `paint`
// (a dielectric paint film over it whose `chips` reveal the oxidised metal). Rust runs down from
// the oxide (`streaks`). `relief` (0..1) builds each finish's height field so the normal map
// carries it: one-texel brush lines, sand grain and pits, faceted spangle crystals, a flaking
// oxide crust with pits (oxide.ts), and a `film`-thick paint step at the chips. Metalness is
// binary per texel (PBR: bare metal 1, oxide/paint 0); colour and roughness blend, metal never.
// params: brush 0 · cast 0 · spangle 0 · oxide 0 · paint 0 · paintRough 0.45 · chips 0.25
//         crystal 0.03 (spangle size, m) · streaks 0 · relief 0 · film 0.0002 (m)

import { type Canvas, noiseAt, param, smooth } from './canvas.ts';
import { rustStreaks } from './masks.ts';
import { hash2 } from './noise.ts';
import { oxideAt } from './oxide.ts';
import { type Cell, fineNoise, isoNoise, rowNoise, worley } from './relief.ts';
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
  const rel = param(p, 'relief', 0);
  const film = param(p, 'film', 0.0002);
  // A strip is metal or not; in-between metalness is not a material (dirt goes in roughness/tone).
  const metal = (r.metalness ?? 1) >= 0.5 ? 1 : 0;
  const cellsU = Math.max(1, Math.round(c.metresU / size));
  const cs = c.metresU / cellsU;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  const cell: Cell = { f1: 0, f2: 0, id: 0 };
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const i = y * c.w + x;
      const xm = (x + 0.5) * pu;
      const big = noiseAt(c, xm, ym, 0.25, 0.25, seed, 4);
      const fine = noiseAt(c, xm, ym, 0.01, 0.01, seed + 1, 2);
      let tone = 1 + 0.05 * big;
      let rough = r.roughness + 0.06 * big + 0.03 * fine;
      // Relief adds the gentle waviness of rolled or cast stock.
      let h = 0.00015 * big + rel * 0.0004 * isoNoise(c, xm, ym, 0.02, seed + 15, 2);
      if (brush > 0) {
        // With relief, brushing is a one-texel line per row (the finest V can hold).
        const s =
          rel > 0
            ? rowNoise(c, xm, y, 0.25, seed + 2) * 0.7 +
              0.3 * fineNoise(c, xm, ym, 0.6, 0, seed + 9)
            : noiseAt(c, xm, ym, 0.6, 0.002, seed + 2, 3);
        tone *= 1 + 0.06 * brush * s;
        rough += 0.08 * brush * s;
        h += brush * (0.00003 + rel * 0.0008) * s;
      }
      if (cast > 0) {
        const pit = noiseAt(c, xm, ym, 0.012, 0.012, seed + 3, 3);
        const lump = noiseAt(c, xm, ym, 0.08, 0.08, seed + 4, 3);
        h += cast * (0.0006 * pit + 0.0008 * lump);
        rough += cast * (0.1 + 0.12 * pit);
        tone *= 1 + cast * (0.16 * pit + 0.08 * lump - 0.04);
        if (rel > 0) {
          // Sand grain (fine along U) and blow-holes: sharp dimples, dark and rough inside.
          // Isotropic features must clear the coarse V texel, or they read as vertical dashes.
          const sand = isoNoise(c, xm, ym, 0.006, seed + 10);
          worley(c, xm, ym, 0.04, seed + 11, cell);
          const hole = cell.id < 0.35 ? smooth(0.3, 0.15, cell.f1) : 0;
          h += rel * cast * (0.0008 * sand - 0.0016 * hole);
          tone *= 1 - rel * cast * (0.12 * hole - 0.06 * sand);
          rough += rel * cast * 0.1 * hole;
        }
      }
      if (spangle > 0) {
        const k = crystal(xm, ym, cs, cellsU, seed + 5);
        const v = hash2(k, 7, seed) * 2 - 1;
        tone *= 1 + 0.12 * spangle * v;
        rough += 0.12 * spangle * v;
        // Each crystal is a slightly different plateau: boundaries read as fine steps.
        h += rel * spangle * 0.00015 * v;
      }
      // Oxide: patchy, gathering in low-frequency blotches; dielectric, rough and a touch proud.
      let ox = 0;
      if (oxide > 0) {
        const o = oxideAt(c, xm, ym, oxide, rel, seed, cell);
        ox = o.mask;
        h += o.height;
        tone *= o.tone;
      }
      let m = metal * (1 - ox);
      let mix = ox;
      rough = rough * (1 - ox) + (0.88 + 0.06 * fine) * ox;
      if (paint > 0) {
        // Chips gather where the noise peaks; the film is everywhere else.
        const n = noiseAt(c, xm, ym, 0.05, 0.05, seed + 8, 4);
        const chip = smooth(0.42, 0.5, n * 0.5 + 0.5 - (1 - chips) * 0.5 + 0.1);
        const coat = paint * (1 - chip);
        m *= 1 - coat;
        mix = mix * (1 - coat) + chip * paint;
        rough = rough * (1 - coat) + (paintRough + 0.05 * big) * coat;
        tone = tone * (1 - coat) + (0.96 + 0.03 * big) * coat;
        // The film levels the metal's own relief and stands `film` proud of the chips.
        h = h * (1 - 0.6 * rel * coat) - chip * paint * (rel > 0 ? film : 0.00015);
        h += rel * coat * 0.00015 * isoNoise(c, xm, ym, 0.012, seed + 16); // orange peel
      }
      c.height[i] = h;
      c.tone[i] = tone;
      c.rough[i] = Math.min(1, Math.max(0, rough));
      c.metal[i] = m >= 0.5 ? metal : 0;
      c.mix[i] = mix;
    }
  }
  rustStreaks(c, param(p, 'streaks', 0), seed + 77);
}
