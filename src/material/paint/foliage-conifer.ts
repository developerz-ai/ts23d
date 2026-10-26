// Needle and blade foliage cells, growing from the bottom-centre anchor toward +V: spruce comb
// (needle tufts off both sides of an axis and its side shoots), snow-loaded spruce (the same with
// snow lumps riding the upper side of each shoot), conifer needle spray (pine bundles fanning from
// twig tips) and reeds/grass (tapering blades, some dry).

import { createRng, type Rng } from '../../core/index.ts';
import type { Canvas } from './canvas.ts';
import { at, type Curve, curve, dim, drawStem, LEAF, vary } from './foliage-common.ts';
import { Foliage } from './foliage-raster.ts';

/** Needles off both sides of a shoot, angled forward, densest mid-shoot. */
function comb(f: Foliage, rng: Rng, shoot: Curve, len: number, k: number, lift: number): void {
  const n = shoot.x.length - 1;
  for (let i = 0; i <= n; i++) {
    for (const side of [-1, 1]) {
      const a = (shoot.a[i] ?? 0) + side * rng.range(0.7, 1.0);
      const col = dim(vary(rng, LEAF.spruce, 0.2), k);
      f.leaf(
        'needle',
        shoot.x[i] ?? 0,
        shoot.y[i] ?? 0,
        a,
        len * rng.range(0.8, 1.1),
        0.006,
        col,
        0,
        lift,
      );
    }
  }
}

function spruce(c: Canvas, seed: number, snow: boolean): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const axis = curve(0.5, 0.02, 0.5 + rng.range(-0.04, 0.04), 0.5, 0.5, 0.95, 60);
  const shoots: Curve[] = [];
  for (let s = 0; s < 8; s++) {
    const t = 0.15 + (s / 8) * 0.75;
    const i = at(axis, t);
    const side = s % 2 === 0 ? 1 : -1;
    const bx = axis.x[i] ?? 0.5;
    const by = axis.y[i] ?? 0.5;
    const len = 0.32 * (1 - t * 0.6);
    const a = side * rng.range(0.9, 1.2);
    shoots.push(
      curve(
        bx,
        by,
        bx + Math.sin(a) * len * 0.5,
        by + Math.cos(a) * len * 0.5,
        bx + Math.sin(a) * len,
        by + Math.cos(a) * len + 0.03,
        24,
      ),
    );
  }
  for (const sh of shoots) comb(f, rng, sh, 0.045, 0.55, 0);
  drawStem(f, axis, 0.012, 0.004, LEAF.bark);
  for (const sh of shoots) drawStem(f, sh, 0.005, 0.002, LEAF.bark);
  comb(f, rng, axis, 0.05, 1, 0.002);
  for (const sh of shoots) comb(f, rng, sh, 0.04, 1, 0.002);
  if (snow) {
    for (const sh of [axis, ...shoots]) {
      const n = sh.x.length - 1;
      for (let i = 2; i < n; i += 3) {
        const col = vary(rng, LEAF.snow, 0.05);
        f.leaf(
          'ovate',
          (sh.x[i] ?? 0) - 0.02,
          (sh.y[i] ?? 0) + 0.008,
          Math.PI / 2 + rng.range(-0.3, 0.3),
          rng.range(0.04, 0.07),
          rng.range(0.025, 0.04),
          col,
          0,
          0.006,
        );
      }
    }
  }
  f.finish(0.5, 0.25);
}

export const paintSpruce = (c: Canvas, seed: number): void => spruce(c, seed, false);
export const paintSpruceSnow = (c: Canvas, seed: number): void => spruce(c, seed, true);

export function paintNeedles(c: Canvas, seed: number): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  const twigs: Curve[] = [];
  for (let s = 0; s < 5; s++) {
    const ex = 0.5 + (s - 2) * 0.13 + rng.range(-0.03, 0.03);
    twigs.push(curve(0.5, 0.02, 0.5 + (ex - 0.5) * 0.4, 0.3, ex, rng.range(0.55, 0.7), 12));
  }
  for (const [s, tw] of twigs.entries()) {
    drawStem(f, tw, 0.012, 0.006, LEAF.bark);
    const k = s % 2 === 0 ? 0.6 : 1;
    // Bundles along the outer third and a full brush at the tip, fanning forward.
    for (let i = 6; i < tw.x.length; i++) {
      const fan = i === tw.x.length - 1 ? 14 : 4;
      for (let q = 0; q < fan; q++) {
        const a = (tw.a[i] ?? 0) + rng.range(-1.1, 1.1) * (fan > 4 ? 0.8 : 1.2);
        const col = dim(vary(rng, LEAF.pine, 0.2), k);
        f.leaf(
          'needle',
          tw.x[i] ?? 0,
          tw.y[i] ?? 0,
          a,
          rng.range(0.12, 0.2),
          0.006,
          col,
          0,
          k * 0.002,
        );
      }
    }
  }
  f.finish(0.5, 0.3);
}

export function paintReeds(c: Canvas, seed: number): void {
  const rng = createRng(seed);
  const f = new Foliage(c);
  for (let b = 0; b < 22; b++) {
    const back = b < 8;
    const x = 0.5 + rng.range(-0.2, 0.2);
    const tilt = (x - 0.5) * 1.2 + rng.range(-0.25, 0.25);
    const col = dim(vary(rng, rng.next() < 0.2 ? LEAF.dry : LEAF.reed, 0.2), back ? 0.55 : 1);
    f.leaf(
      'blade',
      x,
      0.0,
      tilt,
      rng.range(0.55, 0.97),
      rng.range(0.018, 0.032),
      col,
      0,
      back ? 0 : 0.002,
    );
  }
  f.finish(0.5, 0.15);
}
