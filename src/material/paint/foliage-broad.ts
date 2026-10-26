// Broadleaf foliage cells: a twig grows from the bottom-centre anchor toward +V, side twigs
// alternate off it, leaves sit at the nodes. A darker back layer of leaves fills the crown first
// for depth. Variants: beech/oak cluster (ovate, fine teeth), palmate maple, autumn maple
// (red/orange/yellow per leaf), birch (small serrated leaves on thin drooping twigs).

import { createRng, type Rng } from '../../core/index.ts';
import type { Canvas } from './canvas.ts';
import { AUTUMN, at, curve, dim, drawStem, LEAF, vary } from './foliage-common.ts';
import { Foliage, type LeafShape, type Rgb } from './foliage-raster.ts';

interface ClusterSpec {
  readonly shape: LeafShape;
  readonly len: number;
  readonly wid: number;
  readonly serrate: number;
  readonly twigs: number;
  readonly perTwig: number;
  readonly back: number;
  /** Side-twig droop: 0 = straight out, 1 = bends back down. */
  readonly droop: number;
  readonly colour: (rng: Rng) => Rgb;
}

function cluster(c: Canvas, seed: number, s: ClusterSpec): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const leafAt = (x: number, y: number, a: number, k: number, lift: number): void => {
    const len = s.len * rng.range(0.8, 1.15) * k;
    f.leaf(s.shape, x, y, a, len, s.wid * (len / s.len), s.colour(rng), s.serrate, lift);
  };
  // Back layer: darker, unattached leaves filling the crown silhouette.
  for (let i = 0; i < s.back; i++) {
    const x = 0.5 + rng.range(-0.33, 0.33);
    const y = rng.range(0.3, 0.85);
    const col = dim(s.colour(rng), 0.5);
    const len = s.len * rng.range(0.8, 1.1);
    f.leaf(s.shape, x, y, rng.range(-1.4, 1.4), len, s.wid * (len / s.len), col, s.serrate);
  }
  const main = curve(
    0.5,
    0.02,
    0.5 + rng.range(-0.1, 0.1),
    0.45,
    0.5 + rng.range(-0.08, 0.08),
    0.8,
  );
  drawStem(f, main, 0.016, 0.004, LEAF.twig);
  for (let k = 0; k < s.twigs; k++) {
    const t = 0.22 + (k / Math.max(1, s.twigs - 1)) * 0.6;
    const side = k % 2 === 0 ? 1 : -1;
    const i = at(main, t);
    const bx = main.x[i] ?? 0.5;
    const by = main.y[i] ?? 0.5;
    const a = (main.a[i] ?? 0) + side * rng.range(0.7, 1.1);
    const len = 0.3 * (1 - t * 0.45);
    const ex = bx + Math.sin(a) * len;
    const ey = by + Math.cos(a) * len - s.droop * len * 0.4;
    const twig = curve(bx, by, (bx + ex) / 2, (by + ey) / 2 + len * 0.15, ex, ey, 8);
    drawStem(f, twig, 0.007, 0.002, LEAF.twig);
    for (let q = 1; q <= s.perTwig; q++) {
      const j = at(twig, q / s.perTwig);
      const alt = q % 2 === 0 ? 1 : -1;
      const ta = (twig.a[j] ?? 0) + (q === s.perTwig ? 0 : alt * rng.range(0.5, 0.9));
      leafAt(twig.x[j] ?? 0, twig.y[j] ?? 0, ta, 1 - 0.15 * (1 - q / s.perTwig), 0.002);
    }
  }
  const tip = main.x.length - 1;
  leafAt(main.x[tip] ?? 0.5, main.y[tip] ?? 0.8, main.a[tip] ?? 0, 1.1, 0.003);
  f.finish(0.5, 0.35);
}

export function paintBroadleaf(c: Canvas, seed: number): void {
  cluster(c, seed, {
    shape: 'ovate',
    len: 0.15,
    wid: 0.085,
    serrate: 0.03,
    twigs: 6,
    perTwig: 3,
    back: 16,
    droop: 0.1,
    colour: (rng) => vary(rng, LEAF.beech, 0.18),
  });
}

export function paintMaple(c: Canvas, seed: number): void {
  cluster(c, seed, {
    shape: 'palmate',
    len: 0.24,
    wid: 0.24,
    serrate: 0.04,
    twigs: 4,
    perTwig: 2,
    back: 7,
    droop: 0,
    colour: (rng) => vary(rng, LEAF.maple, 0.15),
  });
}

export function paintMapleAutumn(c: Canvas, seed: number): void {
  cluster(c, seed, {
    shape: 'palmate',
    len: 0.24,
    wid: 0.24,
    serrate: 0.04,
    twigs: 4,
    perTwig: 2,
    back: 7,
    droop: 0,
    colour: (rng) => vary(rng, rng.pick(AUTUMN), 0.12),
  });
}

export function paintBirch(c: Canvas, seed: number): void {
  cluster(c, seed, {
    shape: 'ovate',
    len: 0.085,
    wid: 0.06,
    serrate: 0.12,
    twigs: 8,
    perTwig: 5,
    back: 22,
    droop: 0.6,
    colour: (rng) => vary(rng, LEAF.birch, 0.2),
  });
}
