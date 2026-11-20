import { describe, expect, it } from 'bun:test';
import { dmath, type Mesh, merge } from '../core/index.ts';
import { weather } from '../passes/index.ts';
import { box } from '../primitives/index.ts';
import { wearMetrics } from './critique-wear.ts';

const BLUE = [0.05, 0.11, 0.24] as const;
const steel = (): Mesh => box({ size: [3, 2, 2], color: BLUE });
/** Repaint every vertex from its position and normal (z up). */
function paint(m: Mesh, f: (p: number[], nz: number, c: number[]) => number[]): Mesh {
  const colors = new Float32Array(m.colors);
  for (let v = 0; v < colors.length / 3; v++) {
    const at = (a: Float32Array): number[] => [0, 1, 2].map((k) => a[v * 3 + k] ?? 0);
    colors.set(f(at(m.positions), m.normals[v * 3 + 2] ?? 0, at(m.colors)), v * 3);
  }
  return { ...m, colors };
}
const fine = (m: Mesh): Mesh => weather(m, { resolution: 0.08, tessellation: 'exact' }).mesh;
const toward = (c: number[], to: number[], k: number): number[] =>
  c.map((x, i) => x + ((to[i] ?? 0) - x) * k);
const MUD = [0.2, 0.14, 0.08];

describe('wearMetrics', () => {
  it('fails if a clean asset scores: flat paint, and parts of different colours by design', () => {
    expect(wearMetrics([fine(steel())])).toEqual({ wearBroad: 0, wearPlaced: 0 });
    const twoTone = merge([
      steel(),
      box({ size: [1, 1, 1], at: [0, 0, 2], color: [0.8, 0.1, 0.1] }),
    ]);
    expect(wearMetrics([fine(twoTone)]).wearBroad).toBe(0);
    expect(wearMetrics([])).toEqual({ wearBroad: 0, wearPlaced: 0 });
  });

  it('broad mud, soot and sun-fade score high, and placed by exposure', () => {
    // Mud fading out by 1.2 m on the sides; soot down from the roof edge.
    const worn = paint(fine(steel()), (p, nz, c) =>
      nz > 0.5
        ? c
        : toward(
            toward(c, MUD, Math.max(0, 1 - (p[2] ?? 0) / 1.2)),
            [0.02, 0.02, 0.02],
            0.6 * Math.max(0, ((p[2] ?? 0) - 1.6) / 0.4),
          ),
    );
    const w = wearMetrics([worn]);
    expect(w.wearBroad).toBeGreaterThan(0.04);
    expect(w.wearPlaced).toBeGreaterThan(0.5);
  });

  it('grows with the strength of the same stain', () => {
    const at = (k: number): number =>
      wearMetrics([
        paint(fine(steel()), (p, _nz, c) => toward(c, MUD, k * Math.max(0, 1 - (p[2] ?? 0) / 0.7))),
      ]).wearBroad;
    expect(at(0.3)).toBeGreaterThan(0.005);
    expect(at(0.6)).toBeGreaterThan(at(0.3) * 1.5);
    expect(at(1)).toBeGreaterThan(at(0.6) * 1.3);
  });

  it('speckle finer than a patch barely counts; blotches not tied to exposure are not placed', () => {
    const hash = (p: number[], s: number): number => {
      const k = p.map((x) => Math.floor(x / s));
      const h = dmath.sin((k[0] ?? 0) * 12.9898 + (k[1] ?? 0) * 78.233 + (k[2] ?? 0) * 37.719);
      return h * 43758.5453 - Math.floor(h * 43758.5453);
    };
    const mesh = weather(steel(), { resolution: 0.03, tessellation: 'exact' }).mesh;
    const speckle = wearMetrics([
      paint(mesh, (p, _n, c) => (hash(p, 0.03) > 0.7 ? toward(c, MUD, 1) : c)),
    ]);
    const blotch = wearMetrics([
      paint(mesh, (p, _n, c) => (hash(p, 0.6) > 0.7 ? toward(c, MUD, 1) : c)),
    ]);
    expect(blotch.wearBroad).toBeGreaterThan(0.05);
    expect(speckle.wearBroad).toBeLessThan(blotch.wearBroad / 2);
    expect(blotch.wearPlaced).toBeLessThan(0.3);
  });

  it("weather(): the default look scores under the 'hero' reading on a 3 m box", () => {
    const run = (read: 'close' | 'hero') =>
      wearMetrics([weather(steel(), { seed: 3, climate: 'wet', read }).mesh]);
    const [close, hero] = [run('close'), run('hero')];
    expect(hero.wearBroad).toBeGreaterThan(close.wearBroad * 1.5);
    expect(hero.wearPlaced).toBeGreaterThan(close.wearPlaced);
    expect(run('hero')).toEqual(hero);
  });
});
