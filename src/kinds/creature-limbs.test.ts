// Far-LOD legs (legTubes): colour blocks survive (a ring where the paint changes, not one colour
// per joint), round tubes, rounded paws on the ground, inside a LOD2 budget.

import { describe, expect, it } from 'bun:test';
import type { Mesh, Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { LEG_SIDES, legTubes } from './creature-limbs.ts';
import { bonesOf } from './creature-skeleton.ts';
import type { CreatureSpec } from './creature-spec.ts';

const FOX: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 6,
  length: 0.68,
  height: 0.425,
  colours: {
    coat: [0.5, 0.1, 0.05],
    nose: [0.02, 0.02, 0.02],
    iris: [0.6, 0.4, 0.1],
    keratin: [0.1, 0.09, 0.08],
  },
};
const RED: Vec3 = [0.8, 0.1, 0.05];
const BLACK: Vec3 = [0.02, 0.02, 0.02];

/** Mean red of the surface between two heights (triangle interiors sampled, colour interpolated). */
function meanRed(m: Mesh, lo: number, hi: number): { red: number; n: number } {
  let sum = 0;
  let n = 0;
  const at = (i: number, k: number): number => m.positions[i * 3 + k] ?? 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    for (let u = 0.1; u < 1; u += 0.2)
      for (let v = 0.1; u + v < 1; v += 0.2) {
        const w = 1 - u - v;
        const z = at(a, 2) * u + at(b, 2) * v + at(c, 2) * w;
        if (z < lo || z > hi) continue;
        sum += (m.colors[a * 3] ?? 0) * u + (m.colors[b * 3] ?? 0) * v + (m.colors[c * 3] ?? 0) * w;
        n++;
      }
  }
  return { red: sum / Math.max(1, n), n };
}

describe('legTubes: the far legs keep their colour blocks', () => {
  const b = bonesOf(FOX);
  const H = b.height;
  // Black stockings from just under the elbow down: the edge sits between two joints.
  const edge = 0.36 * H;
  const m = legTubes(b, (p) => (p[2] < edge ? BLACK : RED));
  if (!m) throw new Error('a quadruped has legs');

  it('a stocking edge between two joints stays an edge, not a joint-to-joint gradient', () => {
    // One paint sample (⅙ of a joint span) either side of the edge is the ring spacing.
    const below = meanRed(m, 0.16 * H, edge - 0.08 * H);
    const above = meanRed(m, edge + 0.08 * H, 0.56 * H);
    expect(below.n).toBeGreaterThan(20);
    expect(above.n).toBeGreaterThan(20);
    expect(below.red).toBeLessThan(0.03);
    expect(above.red).toBeGreaterThan(0.77);
  });

  it('tubes are 8-sided and the whole set stays inside a far-LOD share (≤ 1 200 triangles)', () => {
    expect(LEG_SIDES).toBe(8);
    const fore = b.legs.find((l) => l.name === 'fore');
    const elbow = fore?.joints[1] ?? [0, 0, 0];
    const r = (fore?.radii[1] ?? 0) * 1.12;
    const ring = new Set<string>();
    for (let i = 0; i < m.positions.length; i += 3) {
      const d = dmath.hypot(
        (m.positions[i] ?? 0) - elbow[0],
        (m.positions[i + 1] ?? 0) - elbow[1],
        (m.positions[i + 2] ?? 0) - elbow[2],
      );
      if (Math.abs(d - r) < r * 1e-3)
        ring.add([0, 1, 2].map((k) => (m.positions[i + k] ?? 0).toFixed(5)).join(','));
    }
    expect(ring.size).toBe(8);
    expect(m.indices.length / 3).toBeLessThanOrEqual(1200);
  });

  it('paws are rounded spindles resting on the ground inside the foot’s footprint', () => {
    let low = Infinity;
    for (let i = 2; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i] ?? 0);
    expect(low).toBeGreaterThanOrEqual(-1e-6);
    expect(low).toBeLessThan(0.002);
    for (const l of b.legs) {
      const [sx, sy, sz] = l.footSize;
      // Vertices of this paw: under the foot's top, within reach of its centre.
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < m.positions.length; i += 3) {
        const [x, y, z] = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
        if (y > 0 && z < sz * 0.5 && Math.abs(x - l.foot[0]) < sx * 1.5) {
          xs.push(x - l.foot[0]);
          ys.push(y - l.foot[1]);
        }
      }
      // Round: at least ten distinct directions about the paw's axis at its widest ring.
      expect(new Set(ys.map((y) => y.toFixed(5))).size).toBeGreaterThanOrEqual(10);
      expect(Math.max(...xs)).toBeLessThanOrEqual(sx * 1.05);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-sx * 1.05);
      expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(sy * 1.25);
    }
  });
});
