import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { sampleStamp, stampSlope, type VdmStamp } from './vdm.ts';
import {
  furrow,
  hornBase,
  poreField,
  scalePatch,
  scarWelt,
  toothSocket,
  wart,
} from './vdm-library.ts';

const ALL = { scalePatch, wart, hornBase, toothSocket, poreField, scarWelt, furrow };

const normals = (s: VdmStamp): number[] => [...s.grid].filter((_, k) => k % 3 === 2);

/** Steepest finite difference of the normal channel between bilinear samples (per unit). */
const sampledSlope = (s: VdmStamp): number => {
  const out = new Float64Array(3);
  const h = 1e-4;
  let worst = 0;
  for (let j = 0; j <= 60; j++)
    for (let i = 0; i <= 60; i++) {
      const u = -0.49 + (0.98 * i) / 60;
      const v = -0.49 + (0.98 * j) / 60;
      sampleStamp(s, u, v, out);
      const z = out[2] ?? 0;
      sampleStamp(s, u + h, v, out);
      const zu = out[2] ?? 0;
      sampleStamp(s, u, v + h, out);
      const zv = out[2] ?? 0;
      worst = Math.max(worst, Math.hypot(zu - z, zv - z) / h);
    }
  return worst;
};

describe('vdm stamp library', () => {
  it('refuses a resolution too coarse to hold a stamp', () => {
    expect(() => wart({ res: 4 })).toThrow(Ts23dError);
    expect(() => scalePatch({ res: 9.5 })).toThrow(Ts23dError);
  });

  it('every stamp is seeded (same seed = same bytes), windowed and honestly declared', () => {
    for (const [name, make] of Object.entries(ALL)) {
      const a = make({ seed: 4 });
      const b = make({ seed: 4 });
      expect({ name, same: a.grid.every((x, k) => x === b.grid[k]) }).toEqual({ name, same: true });
      const c = make({ seed: 5 });
      expect({ name, differs: c.grid.some((x, k) => x !== a.grid[k]) }).toEqual({
        name,
        differs: true,
      });
      expect(a.lipschitz).toBe(stampSlope(a.size, a.grid, 2));
      expect(sampledSlope(a)).toBeLessThanOrEqual(a.lipschitz * 1.001);
      const n = a.size;
      for (let i = 0; i < n; i++) expect(a.grid[i * 3 + 2]).toBe(0);
    }
  });

  it('each stamp has the shape its name promises', () => {
    const z = new Float64Array(3);
    // Wart: highest exactly at the centre.
    const w = wart({ seed: 3 });
    sampleStamp(w, 0, 0, z);
    expect(z[2]).toBeCloseTo(Math.max(...normals(w)), 6);
    // Socket: a pit in a raised rim; pores and furrows only cut (furrow lips aside).
    const t = toothSocket();
    expect(Math.min(...normals(t))).toBeLessThan(-0.9);
    expect(Math.max(...normals(t))).toBeGreaterThan(0.3);
    expect(Math.max(...normals(poreField()))).toBe(0);
    sampleStamp(furrow({ seed: 1 }), 0, 0, z);
    expect(z[2]).toBeLessThan(-0.9);
    // Welt: raised along its centre line; horn base: a raised collar around the root.
    sampleStamp(scarWelt({ seed: 1 }), 0, 0, z);
    expect(z[2]).toBeGreaterThan(0.6);
    sampleStamp(hornBase(), 0, 0, z);
    expect(z[2]).toBeGreaterThan(0.5);
  });

  it('scales shingle: each scale is lower at its root (−v) than its tip (+v)', () => {
    const s = scalePatch({ rows: 1, cols: 1, seed: 2 });
    const z = new Float64Array(3);
    const at = (v: number): number => {
      sampleStamp(s, 0, v, z);
      return z[2] ?? 0;
    };
    expect(at(0.15)).toBeGreaterThan(at(-0.15) * 1.3);
    // The vector part leans the tips toward +v.
    sampleStamp(s, 0, 0.1, z);
    expect(z[1]).toBeGreaterThan(0);
  });
});
