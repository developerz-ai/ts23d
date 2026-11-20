// wild-paint.ts: a scar tapers to nothing at its ends (failure first: at an end the taper is 0,
// so `smooth(0, 0, d)` gave NaN on the end point and full scar colour in a disc around it).

import { describe, expect, it } from 'bun:test';
import type { Vec3 } from '@developerz.ai/ts23d';
import { lockPaint, lockShade, lockTone, wearPaint } from './wild-paint.ts';

const BASE: Vec3 = [0.5, 0.4, 0.3];
const UP: Vec3 = [0, 0, 1];
const paint = wearPaint({ scars: [{ a: [0, 0, 1], b: [0.2, 0, 1], width: 0.01 }] });

describe('wearPaint scars', () => {
  it('paints a finite colour on the scar end points', () => {
    for (const p of [
      [0, 0, 1],
      [0.2, 0, 1],
    ] as Vec3[]) {
      for (const c of paint(p, UP, BASE)) expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('leaves the coat untouched just past either end', () => {
    expect(paint([-0.005, 0, 1], UP, BASE)).toEqual(BASE);
    expect(paint([0.205, 0, 1], UP, BASE)).toEqual(BASE);
  });

  it('still marks the middle of the scar', () => {
    const mid = paint([0.1, 0, 1], UP, BASE);
    expect(Math.abs(mid[0] - BASE[0])).toBeGreaterThan(0.05);
  });
});

describe('lockTone', () => {
  const tone = lockTone(() => [1, 0, 0], { size: 0.02, strength: 0.3 });
  /** Mean |Δtone| over steps of `step` metres along `axis`. */
  const change = (axis: 0 | 1, step: number): number => {
    let sum = 0;
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [0.013 * i, 0.007 * i, 0.5];
      const q: Vec3 = [p[0] + (axis === 0 ? step : 0), p[1] + (axis === 1 ? step : 0), p[2]];
      sum += Math.abs(tone(p) - tone(q));
    }
    return sum / 400;
  };

  it('varies several times faster across the lie than along it (locks, not blotches)', () => {
    expect(change(1, 0.01)).toBeGreaterThan(change(0, 0.01) * 3);
  });

  it('stays inside −1..1 and reaches both a parting and a lit lock', () => {
    const all = Array.from({ length: 600 }, (_, i) => tone([0.01 * i, 0.011 * i, 0.3]));
    expect(Math.min(...all)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...all)).toBeLessThanOrEqual(1);
    expect(Math.min(...all)).toBeLessThan(-0.8);
    expect(Math.max(...all)).toBeGreaterThan(0.8);
  });
});

describe('lockShade', () => {
  it('darkens a parting more than it lifts a lock, and leaves tone 0 alone', () => {
    expect(lockShade(BASE, 0, 0.3)).toEqual(BASE);
    expect(lockShade(BASE, -1, 0.3)[0]).toBeLessThan(BASE[0] * 0.75);
    expect(lockShade(BASE, 1, 0.3)[0]).toBeCloseTo(BASE[0] * 1.15, 5);
  });
});

describe('lockPaint', () => {
  it('shades at the strength its Locks carry (lockTone alone never read it)', () => {
    const dir = (): Vec3 => [1, 0, 0];
    const soft = lockPaint(dir, { size: 0.02, strength: 0.1, seed: 4 });
    const hard = lockPaint(dir, { size: 0.02, strength: 0.6, seed: 4 });
    const tone = lockTone(dir, { size: 0.02, strength: 0.6, seed: 4 });
    const swing = (f: (p: Vec3, c: Vec3) => Vec3): number => {
      let sum = 0;
      for (let i = 0; i < 200; i++)
        sum += Math.abs(f([0.01 * i, 0.013 * i, 0.4], BASE)[0] - BASE[0]);
      return sum;
    };
    expect(swing(hard)).toBeGreaterThan(swing(soft) * 3);
    const p: Vec3 = [0.05, 0.07, 0.4];
    expect(hard(p, BASE)).toEqual(lockShade(BASE, tone(p), 0.6));
  });
});

describe('wearPaint mud', () => {
  const top = 0.3;
  const paint = wearPaint({ seed: 5, mud: { top, colour: [0.4, 0.35, 0.3] } });
  /** Mean departure from the coat at height z over a strip of points round the leg. */
  const stain = (z: number): number => {
    let sum = 0;
    for (let i = 0; i < 300; i++) {
      const c = paint([0.011 * i, 0.017 * i, z], [1, 0, 0], BASE);
      sum += Math.abs(c[0] - BASE[0]) + Math.abs(c[1] - BASE[1]) + Math.abs(c[2] - BASE[2]);
    }
    return sum / 300;
  };

  it('is graded from the toes: heaviest on the paw, then thinning up the leg (no sock line)', () => {
    // Failure first: the old band was solid to 0.52 × top, so the paw and mid-band matched.
    expect(stain(0.02)).toBeGreaterThan(stain(top * 0.5) * 1.25);
    expect(stain(top * 0.5)).toBeGreaterThan(stain(top * 0.95) * 1.25);
  });

  it('is darker than the clay on the toes, never paler than the clay anywhere', () => {
    for (const z of [0.01, top * 0.4, top * 0.8, top * 1.4])
      for (let i = 0; i < 200; i++) {
        const c = paint([0.013 * i, 0.007 * i, z], [1, 0, 0], BASE);
        expect(c[0]).toBeLessThanOrEqual(Math.max(BASE[0], 0.4) + 1e-6);
      }
    expect(paint([0, 0, 0.005], [1, 0, 0], BASE)[0]).toBeLessThan(0.34);
  });
});

describe('wearPaint on a far mesh (coarse)', () => {
  const spec = {
    seed: 3,
    mud: { top: 0.2, colour: [0.4, 0.35, 0.3] as Vec3 },
    scars: [{ a: [0, 0, 1] as Vec3, b: [0.2, 0, 1] as Vec3, width: 0.01 }],
  };
  const near = wearPaint(spec);
  const far = wearPaint(spec, true);

  it('drops the scar and the splashed flecks, keeps the mud band', () => {
    // Mid scar: marked up close, untouched far away.
    expect(near([0.1, 0, 1], UP, BASE)).not.toEqual(BASE);
    expect(far([0.1, 0, 1], UP, BASE)).toEqual(BASE);
    // Above the caked band (0.66 × top) only flecks reach: some point there is splashed up
    // close, none on the far mesh.
    let [splashed, farSplashed] = [0, 0];
    for (let i = 0; i < 400; i++) {
      const p: Vec3 = [0.013 * i, 0.007 * i, 0.3];
      if (near(p, UP, BASE)[0] !== BASE[0]) splashed++;
      if (far(p, UP, BASE)[0] !== BASE[0]) farSplashed++;
    }
    expect(splashed).toBeGreaterThan(0);
    expect(farSplashed).toBe(0);
    // On the ground the far mesh is still muddy.
    expect(far([0.1, 0, 0.01], UP, BASE)).not.toEqual(BASE);
  });
});

// D482: a pale dried-clay patch on the far mesh's flat cells read as a slab; a fixed pale scar
// core read as a bright paint stroke on a grey coat.
describe('wearPaint far patches and regrowth scars', () => {
  const patch = {
    at: [0, 0, 1] as Vec3,
    radius: 0.1,
    colour: [0.9, 0.9, 0.9] as Vec3,
    strength: 1,
  };
  it('skips a `far: false` patch on the far mesh only', () => {
    const near = wearPaint({ patches: [{ ...patch, far: false }] });
    const far = wearPaint({ patches: [{ ...patch, far: false }] }, true);
    expect(near([0, 0, 1], UP, BASE)).not.toEqual(BASE);
    expect(far([0, 0, 1], UP, BASE)).toEqual(BASE);
    expect(wearPaint({ patches: [patch] }, true)([0, 0, 1], UP, BASE)).not.toEqual(BASE);
  });
  it('paints a scar core from the coat under it when scarColour is a function', () => {
    const scar = { a: [0, 0, 1] as Vec3, b: [0.2, 0, 1] as Vec3, width: 0.01 };
    const regrowth = wearPaint({
      scars: [scar],
      scarColour: (c) => [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2],
    });
    const mid = regrowth([0.1, 0, 1], UP, BASE);
    // Paler than the coat, the coat's own hue: not the default grey-pink.
    expect(mid[0]).toBeGreaterThan(BASE[0]);
    expect(mid[0] / mid[2]).toBeCloseTo(BASE[0] / BASE[2], 1);
  });
});
