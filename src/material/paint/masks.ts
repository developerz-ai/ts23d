// Weathering masks applied over a painted canvas: rust streaks (vertical runs from a patchy
// source, darker and rougher, killing metalness) and grime (dirt pooling toward the bottom of the
// region — world-down is low V — plus soft vertical rain streaks).

import { type Canvas, noiseAt, smooth } from './canvas.ts';

export function rustStreaks(c: Canvas, amount: number, seed: number): void {
  if (amount <= 0) return;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const run = noiseAt(c, xm, ym, 0.025, 0.6, seed, 3);
      const patch = noiseAt(c, xm, ym, 0.3, 0.3, seed + 1, 2);
      const m = amount * smooth(0.15, 0.6, run) * smooth(-0.1, 0.4, patch);
      if (m <= 0) continue;
      const i = y * c.w + x;
      c.tone[i] = (c.tone[i] ?? 1) * (1 - 0.4 * m);
      c.rough[i] = Math.min(1, (c.rough[i] ?? 0.8) + 0.2 * m);
      c.metal[i] = (c.metal[i] ?? 0) * (1 - m);
    }
  }
}

export function grime(c: Canvas, amount: number, seed: number): void {
  if (amount <= 0) return;
  const pu = c.metresU / c.w;
  const pv = c.metresV / c.h;
  for (let y = 0; y < c.h; y++) {
    const ym = (y + 0.5) * pv;
    const low = (1 - ym / c.metresV) ** 2;
    for (let x = 0; x < c.w; x++) {
      const xm = (x + 0.5) * pu;
      const streak = smooth(0, 0.7, noiseAt(c, xm, ym, 0.05, 0.5, seed, 3));
      const blot = 0.6 + 0.4 * noiseAt(c, xm, ym, 0.2, 0.2, seed + 1, 3);
      const m = amount * Math.min(1, low * blot + 0.35 * streak);
      const i = y * c.w + x;
      c.tone[i] = (c.tone[i] ?? 1) * (1 - 0.3 * m);
      c.rough[i] = Math.min(1, (c.rough[i] ?? 0.8) + 0.1 * m);
    }
  }
}
