// Compound and strand foliage cells, all growing from the bottom-centre anchor toward +V:
// pinnate acacia (rachis, paired pinnae, tiny leaflets), palm frond (arched rachis, lance
// leaflets both sides, some dry brown tips), willow curtain (long fine strands of narrow leaves;
// hang it by mapping the card with V down). A dimmed back layer goes down first.

import { createRng } from '../../core/index.ts';
import type { Canvas } from './canvas.ts';
import { at, curve, dim, drawStem, LEAF, vary } from './foliage-common.ts';
import { Foliage } from './foliage-raster.ts';

export function paintAcacia(c: Canvas, seed: number): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const rachis = curve(0.5, 0.02, 0.48 + rng.range(-0.05, 0.05), 0.5, 0.5, 0.95);
  for (let layer = 0; layer < 2; layer++) {
    const k = layer === 0 ? 0.5 : 1;
    if (layer === 1) drawStem(f, rachis, 0.01, 0.003, LEAF.twig);
    const pairs = layer === 0 ? 6 : 8;
    for (let p = 0; p < pairs; p++) {
      const t = 0.15 + (p / pairs) * 0.8 + (layer === 0 ? 0.05 : 0);
      const i = at(rachis, t);
      for (const side of [-1, 1]) {
        const a = (rachis.a[i] ?? 0) + side * rng.range(0.9, 1.2);
        const len = 0.22 * (1 - t * 0.5);
        const bx = rachis.x[i] ?? 0.5;
        const by = rachis.y[i] ?? 0.5;
        const pinna = curve(
          bx,
          by,
          bx + Math.sin(a) * len * 0.5,
          by + Math.cos(a) * len * 0.5 + 0.02,
          bx + Math.sin(a) * len,
          by + Math.cos(a) * len,
          6,
        );
        drawStem(f, pinna, 0.003, 0.0015, dim(LEAF.twig, k));
        for (let q = 1; q <= 12; q++) {
          const j = at(pinna, q / 12.5);
          const col = dim(vary(rng, LEAF.acacia, 0.15), k);
          for (const s2 of [-1, 1])
            f.leaf(
              'ovate',
              pinna.x[j] ?? 0,
              pinna.y[j] ?? 0,
              (pinna.a[j] ?? 0) + s2 * 1.1,
              0.03,
              0.011,
              col,
              0,
              layer * 0.002,
            );
        }
      }
    }
  }
  f.finish(0.5, 0.25);
}

export function paintPalm(c: Canvas, seed: number): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const rachis = curve(0.5, 0.02, 0.3, 0.7, 0.78, 0.96, 24);
  for (let layer = 0; layer < 2; layer++) {
    const k = layer === 0 ? 0.55 : 1;
    const n = 26;
    for (let q = 0; q < n; q++) {
      const t = 0.1 + (q / n) * 0.9 + (layer === 0 ? 0.015 : 0);
      const i = at(rachis, Math.min(1, t));
      const bx = rachis.x[i] ?? 0.5;
      const by = rachis.y[i] ?? 0.5;
      for (const side of [-1, 1]) {
        const a = (rachis.a[i] ?? 0) + side * rng.range(0.75, 1.0);
        const len = 0.3 * Math.sin(Math.PI * (0.2 + 0.75 * t)) * rng.range(0.85, 1.05);
        const wid = 0.03;
        f.leaf('lance', bx, by, a, len, wid, dim(vary(rng, LEAF.palm, 0.15), k), 0, layer * 0.002);
        if (rng.next() < 0.3) {
          const tx = bx + Math.sin(a) * len * 0.72;
          const ty = by + Math.cos(a) * len * 0.72;
          f.leaf(
            'blade',
            tx,
            ty,
            a,
            len * 0.28,
            wid * 0.55,
            dim(vary(rng, LEAF.dry, 0.2), k),
            0,
            layer * 0.002 + 0.0002,
          );
        }
      }
    }
    if (layer === 0) drawStem(f, rachis, 0.018, 0.004, dim(LEAF.palm, 0.8));
  }
  f.finish(0.5, 0.2);
}

export function paintWillow(c: Canvas, seed: number): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const strands = 9;
  for (let s = 0; s < strands; s++) {
    const back = s < 3;
    const k = back ? 0.55 : 1;
    const ex = 0.5 + rng.range(-0.4, 0.4);
    const strand = curve(
      0.5 + rng.range(-0.03, 0.03),
      0.02,
      (0.5 + ex) / 2 + rng.range(-0.1, 0.1),
      0.5,
      ex,
      rng.range(0.85, 0.97),
      24,
    );
    drawStem(f, strand, 0.006, 0.0015, dim(LEAF.twig, k));
    for (let q = 2; q < 30; q++) {
      const j = at(strand, q / 30);
      const side = q % 2 === 0 ? 1 : -1;
      const a = (strand.a[j] ?? 0) + side * rng.range(0.2, 0.45);
      const col = dim(vary(rng, LEAF.willow, 0.18), k);
      f.leaf(
        'lance',
        strand.x[j] ?? 0,
        strand.y[j] ?? 0,
        a,
        rng.range(0.07, 0.1),
        0.014,
        col,
        0,
        back ? 0 : 0.002,
      );
    }
  }
  f.finish(0.5, 0.2);
}
