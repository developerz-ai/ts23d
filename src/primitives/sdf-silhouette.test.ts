import { describe, expect, it } from 'bun:test';
import { boundsOf, Ts23dError } from '../core/index.ts';
import { openEdges } from './closed.ts';
import { sculpt } from './sculpt.ts';
import { sd } from './sdf-ops.ts';
import { memo2, polygonSdf, visualHull } from './sdf-silhouette.ts';

const WHITE: [number, number, number] = [1, 1, 1];
/** Front: an egg 0.8 m wide, 1 m tall. Side: a 0.6 m deep slab with a notch out of its top front. */
const FRONT = '<svg viewBox="-50 0 100 100"><ellipse cx="0" cy="50" rx="40" ry="50"/></svg>';
const SIDE = '<svg viewBox="-50 0 100 100"><path d="M-30 100 H30 V40 H10 V0 H-30 Z"/></svg>';

describe('polygonSdf', () => {
  it('is exact: negative inside, distance to the nearest edge, holes outside', () => {
    const f = polygonSdf([
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      [
        [1, 1],
        [3, 1],
        [3, 3],
        [1, 3],
      ],
    ]);
    expect(f(0.5, 2)).toBeCloseTo(-0.5, 12);
    expect(f(2, 2)).toBeCloseTo(1, 12); // centre of the hole: outside, 1 from its edges
    expect(f(6, 4)).toBeCloseTo(2, 12);
    expect(f(7, 8)).toBeCloseTo(5, 12);
  });
});

describe('memo2', () => {
  it('keys on BOTH arguments: a shared u with a new v is computed, not served stale', () => {
    let calls = 0;
    const f = memo2((u, v) => {
      calls++;
      return u * 10 + v;
    });
    expect(f(1, 2)).toBe(12);
    expect(f(1, 3)).toBe(13);
    expect(f(2, 2)).toBe(22);
    expect(f(1, 2)).toBe(12);
    expect(calls).toBe(3);
  });
  it('returns exactly the polygon distance it wraps', () => {
    const sq: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const raw = polygonSdf([sq]);
    const f = memo2(polygonSdf([sq]));
    for (const [u, v] of [
      [0.3, 1.7],
      [5, -1],
      [0.3, 1.7],
      [-0, 2],
      [0, 2],
    ] as const)
      expect(Object.is(f(u, v), raw(u, v))).toBe(true);
  });
});

describe('visualHull', () => {
  it('needs two views', () => {
    let c = '';
    try {
      visualHull({ front: FRONT, scale: 0.01 });
    } catch (e) {
      c = e instanceof Ts23dError ? e.code : 'other';
    }
    expect(c).toBe('T3D_RECIPE_INVALID');
  });

  it('is inside only where every view is inside', () => {
    const { field, bounds } = visualHull({ front: FRONT, side: SIDE, scale: 0.01 });
    expect(bounds).toEqual([
      [-0.3, -0.4, 0],
      [0.3, 0.4, 1],
    ]);
    expect(field([0, 0, 0.5])).toBeLessThan(0); // in both
    expect(field([0.2, 0, 0.8])).toBeGreaterThan(0); // in the front egg, in the side notch
    expect(field([-0.2, 0, 0.8])).toBeLessThan(0); // behind the notch
    expect(field([0, 0.39, 0.95])).toBeGreaterThan(0); // in the side slab, outside the egg
    // Exact along a view axis: 0.1 m in front of the slab's lower face.
    expect(field([0.4, 0, 0.3])).toBeCloseTo(0.1, 9);
    // With the world offset.
    expect(
      visualHull({ front: FRONT, side: SIDE, scale: 0.01, at: [5, 0, 0] }).field([5, 0, 0.5]),
    ).toBeLessThan(0);
  });

  it('is 1-Lipschitz (safe for sparse meshing), rounded or not; rounding only shrinks', () => {
    const hard = visualHull({ front: FRONT, side: SIDE, scale: 0.01 }).field;
    for (const round of [0, 0.05]) {
      const { field } = visualHull({ front: FRONT, side: SIDE, scale: 0.01, round });
      for (let i = 0; i < 400; i++) {
        const p: [number, number, number] = [
          ((i * 37) % 97) / 80 - 0.6,
          ((i * 53) % 89) / 70 - 0.6,
          ((i * 71) % 83) / 60 - 0.2,
        ];
        const q: [number, number, number] = [p[0] + 0.013, p[1] - 0.007, p[2] + 0.011];
        const step = Math.hypot(0.013, 0.007, 0.011);
        expect(Math.abs(field(p) - field(q))).toBeLessThanOrEqual(step + 1e-9);
        expect(field(p)).toBeGreaterThanOrEqual(hard(p));
      }
    }
    // The crease between the egg (front) and the slab (side) at the slab's top back corner moves in.
    const round = visualHull({ front: FRONT, side: SIDE, scale: 0.01, round: 0.05 }).field;
    expect(round([-0.28, 0.2, 0.85])).toBeGreaterThan(hard([-0.28, 0.2, 0.85]));
    const field = hard;
    expect(sd.silhouette({ front: FRONT, side: SIDE, scale: 0.01 })([0, 0, 0.5])).toBe(
      field([0, 0, 0.5]),
    );
  });

  it('works as a sculpt edit: blends with shapes into one closed mesh', () => {
    const hull = visualHull({ front: FRONT, side: SIDE, scale: 0.01 });
    const m = sculpt({
      edits: [
        { ...hull },
        { shape: 'sphere', at: [0.3, 0, 0.3], size: 0.08, blend: 0.04 },
        { shape: 'sphere', at: [-0.3, 0, 0.6], size: 0.1, op: 'subtract', blend: 0.02 },
      ],
      resolution: 0.03,
      color: WHITE,
      mirror: 'y',
    });
    expect(openEdges(m)).toBe(0);
    const { min, max } = boundsOf(m);
    expect(max[0]).toBeGreaterThan(0.33); // the sphere sticks out of the slab front
    expect(min[2]).toBeGreaterThan(-0.05);
    expect(max[2]).toBeLessThan(1.05);
  });
});
