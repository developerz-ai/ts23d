import { describe, expect, it } from 'bun:test';
import { createRng, dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import { sculptField } from './sculpt.ts';
import { shapes } from './sdf-ops.ts';
import { compileVdm } from './vdm.ts';
import { scalePatch } from './vdm-library.ts';
import { scatterStamps } from './vdm-scatter.ts';

const R = 0.5;
const ball = (p: Vec3): number => shapes.sphere(p[0], p[1], p[2], R);
const BOX: [Vec3, Vec3] = [
  [-0.6, -0.6, -0.6],
  [0.6, 0.6, 0.6],
];
/** Flow: circles about Z (a tangent field on the sphere away from the poles). */
const swirl = (p: Vec3): Vec3 => [-p[1], p[0], 0];

describe('vdm scatter', () => {
  it('refuses a zero scale and inverted bounds', () => {
    const rng = createRng(1);
    expect(() => scatterStamps({ field: ball, bounds: BOX, rng, scale: 0 })).toThrow(Ts23dError);
    expect(() => scatterStamps({ field: ball, bounds: [BOX[1], BOX[0]], rng, scale: 0.1 })).toThrow(
      Ts23dError,
    );
  });

  it('anchors sit on the surface, Poisson-spaced, framed by ∇f, deterministic', () => {
    const run = () =>
      scatterStamps({ field: ball, bounds: BOX, rng: createRng(7), scale: 0.12, attempts: 3000 });
    const a = run();
    expect(a.length).toBeGreaterThan(150);
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
    for (const q of a) {
      expect(Math.abs(dmath.norm(q.at) - R)).toBeLessThan(0.001);
      const r = dmath.norm(q.at);
      expect(
        q.normal[0] * (q.at[0] / r) + q.normal[1] * (q.at[1] / r) + q.normal[2] * (q.at[2] / r),
      ).toBeGreaterThan(0.999);
    }
    let close = Number.POSITIVE_INFINITY;
    for (let i = 0; i < a.length; i++)
      for (let j = i + 1; j < a.length; j++) {
        const p = a[i]?.at ?? [0, 0, 0];
        const q = a[j]?.at ?? [0, 0, 0];
        close = Math.min(close, dmath.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      }
    expect(close).toBeGreaterThanOrEqual(0.8 * 0.12);
  });

  it('zone and size masks: nothing where the zone is 0, bigger stamps where size says', () => {
    const a = scatterStamps({
      field: ball,
      bounds: BOX,
      rng: createRng(3),
      scale: 0.1,
      depth: 0.01,
      zone: (p) => (p[2] > 0 ? 1 : 0),
      size: (p) => (p[0] > 0 ? 2 : 1),
    });
    expect(a.length).toBeGreaterThan(40);
    expect(a.every((q) => q.at[2] > 0)).toBe(true);
    for (const q of a) {
      const s = q.at[0] > 0 ? 2 : 1;
      expect(q.scale).toBeCloseTo(0.1 * s, 12);
      expect(q.depth).toBeCloseTo(0.01 * s, 12);
    }
  });

  it('scale-patch orientation follows the flow field', () => {
    const places = scatterStamps({
      field: ball,
      bounds: [
        [-0.6, -0.6, -0.2],
        [0.6, 0.6, 0.2],
      ],
      rng: createRng(5),
      scale: 0.1,
      flow: swirl,
      max: 30,
    });
    expect(places.length).toBe(30);
    const s = scalePatch({ rows: 1, cols: 1, seed: 1 });
    for (const q of places) {
      // Each stamp's tips (+v) point along the flow: the displacement a little way along the flow
      // from the anchor is larger than the same distance against it (root low, tip high).
      const c = compileVdm({ vdm: s, places: [q] }, 't', false);
      const f = swirl(q.at);
      const fl = dmath.norm(f);
      const step = (k: number): Vec3 => [
        q.at[0] + (f[0] / fl) * k,
        q.at[1] + (f[1] / fl) * k,
        q.at[2] + (f[2] / fl) * k,
      ];
      const tip = -c.apply(step(0.015), 0);
      const root = -c.apply(step(-0.015), 0);
      expect(tip).toBeGreaterThan(root);
    }
    // And they mesh as one sculpt edit.
    const field = sculptField(
      [
        { shape: 'sphere', at: [0, 0, 0], size: R },
        { vdm: s, places },
      ],
      {
        color: [1, 1, 1],
      },
    ).field;
    expect(field(places[0]?.at ?? [0, 0, 0])).toBeLessThan(0);
  });

  it('keeps stamps out of a gap where they would print onto the facing surface', () => {
    const two = (p: Vec3): number =>
      Math.min(
        shapes.sphere(p[0] + 0.55, p[1], p[2], R),
        shapes.sphere(p[0] - 0.55, p[1], p[2], R),
      );
    const run = (clearance: number) =>
      scatterStamps({
        field: two,
        bounds: [
          [-0.15, -0.3, -0.3],
          [0.15, 0.3, 0.3],
        ],
        rng: createRng(2),
        scale: 0.3,
        clearance,
      }).filter((q) => Math.abs(q.at[0]) < 0.08);
    expect(run(0).length).toBeGreaterThan(0);
    expect(run(0.5).length).toBe(0);
  });
});
