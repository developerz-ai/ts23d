import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount, type Vec3 } from '../core/index.ts';
import { openEdges, windingFlips } from './closed.ts';
import { type SculptEdit, type SculptShapeEdit, sculpt, sculptField } from './sculpt.ts';

const SKIN: Vec3 = [0.4, 0.6, 0.3];
const RED: Vec3 = [0.9, 0.1, 0.1];
const WHITE: Vec3 = [1, 1, 1];

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

const run = (edits: SculptEdit[], resolution = 0.02, mirror?: 'y'): Mesh =>
  sculpt({ edits, resolution, color: SKIN, ...(mirror ? { mirror } : {}) });

const near = (m: Mesh, c: Vec3): number => {
  let n = 0;
  for (let i = 0; i < m.colors.length; i += 3)
    if ([0, 1, 2].every((k) => Math.abs((m.colors[i + k] ?? 0) - (c[k] ?? 0)) < 0.02)) n++;
  return n;
};

describe('sculpt', () => {
  it('throws T3D_RECIPE_INVALID with a fix on unusable edit lists', () => {
    const empty = fails(() => run([]));
    expect(empty.code).toBe('T3D_RECIPE_INVALID');
    expect(empty.fix).toContain("op: 'add'");
    expect(
      fails(() => run([{ shape: 'sphere', at: [0, 0, 0], size: 0.1, op: 'subtract' }])).fix,
    ).toContain("op: 'add'");
    expect(fails(() => run([{ shape: 'capsule', at: [0, 0, 0], size: 0.1 }])).fix).toContain('to:');
    expect(
      fails(() => run([{ shape: 'ellipsoid', at: [0, 0, 0], size: [0.1, 0, 0.1] }])).fix,
    ).toContain('> 0');
    expect(
      fails(() => run([{ shape: 'sphere', at: [0, 0, 0], size: 0.1, blend: -1 }])).fix,
    ).toContain('≥ 0');
    expect(fails(() => run([{ shape: 'sphere', at: [0, 0, 0], size: 1 }], 0.0001)).fix).toContain(
      'cells ≥',
    );
  });

  it('finds bounds from the edits (+ blend), mirrored across Y', () => {
    const s = sculptField([{ shape: 'sphere', at: [0, 0.1, 0], size: 0.05, blend: 0.01 }], {
      color: SKIN,
      mirror: 'y',
    });
    expect(s.bounds[0][1]).toBeCloseTo(-0.16, 6);
    expect(s.bounds[1][1]).toBeCloseTo(0.16, 6);
    const m = run([{ shape: 'sphere', at: [0, 0.1, 0], size: 0.05 }], 0.01, 'y');
    const b = boundsOf(m);
    expect(b.min[1]).toBeCloseTo(-b.max[1], 2);
    expect(b.max[1]).toBeCloseTo(0.15, 1);
    // An edit can opt out of the mirror.
    const one = run([{ shape: 'sphere', at: [0, 0.1, 0], size: 0.05, mirror: false }], 0.01, 'y');
    expect(boundsOf(one).min[1]).toBeGreaterThan(0);
  });

  it('every shape meshes closed and outward', () => {
    const shapes: SculptShapeEdit[] = [
      { shape: 'sphere', at: [0, 0, 0], size: 0.1 },
      { shape: 'ellipsoid', at: [0, 0, 0], size: [0.1, 0.06, 0.04], rotate: [10, 20, 30] },
      { shape: 'capsule', at: [0, 0, 0], to: [0.1, 0.05, 0.1], size: 0.03 },
      { shape: 'roundBox', at: [0, 0, 0], size: [0.2, 0.1, 0.1], round: 0.02, rotate: [0, 0, 45] },
      { shape: 'cone', at: [0, 0, 0], size: [0.08, 0.02, 0.15] },
      { shape: 'torus', at: [0, 0, 0], size: [0.1, 0.03], rotate: [90, 0, 0] },
    ];
    for (const e of shapes) {
      const m = run([e], 0.01);
      expect([e.shape, openEdges(m), windingFlips(m)]).toEqual([e.shape, 0, 0]);
    }
  });

  it('subtract carves; blend fillets; colour follows the blend weights', () => {
    const body: SculptEdit = { shape: 'sphere', at: [0, 0, 0], size: 0.1 };
    const carved = run([
      body,
      { shape: 'sphere', at: [0.1, 0, 0], size: 0.05, op: 'subtract', color: RED },
    ]);
    // The cut's rim sits at x = 0.0875 (|p| = 0.1 meets |p − (0.1, 0, 0)| = 0.05); uncut: 0.1.
    expect(boundsOf(carved).max[0]).toBeLessThan(0.092);
    expect(boundsOf(run([body])).max[0]).toBeGreaterThan(0.095);
    expect(near(carved, RED)).toBeGreaterThan(10);
    const hard = run([body, { shape: 'sphere', at: [0.12, 0, 0], size: 0.05, color: WHITE }]);
    const soft = run([
      body,
      { shape: 'sphere', at: [0.12, 0, 0], size: 0.05, color: WHITE, blend: 0.04 },
    ]);
    // A fillet adds material in the crease, and blended colours appear between the two.
    expect(near(hard, WHITE)).toBeGreaterThan(10);
    const between = (m: Mesh): number =>
      m.colors.filter((c, i) => i % 3 === 0 && c > 0.45 && c < 0.95).length;
    expect(between(soft)).toBeGreaterThan(between(hard));
    // Paint changes colour, not shape.
    const painted = run([
      body,
      { shape: 'sphere', at: [0.1, 0, 0], size: 0.03, op: 'paint', color: RED },
    ]);
    expect(near(painted, RED)).toBeGreaterThan(3);
    expect(painted.positions).toEqual(run([body]).positions);
  });

  it('resolution is the LOD knob and the output is deterministic', () => {
    const head: SculptEdit[] = [
      { shape: 'ellipsoid', at: [0, 0, 0.12], size: [0.09, 0.08, 0.11] },
      { shape: 'sphere', at: [0.07, 0.03, 0.13], size: 0.015, blend: 0.005, color: WHITE },
    ];
    const counts = [0.004, 0.012, 0.03].map((r) => triangleCount(run(head, r, 'y')));
    expect(counts[0]).toBeGreaterThan(counts[1] ?? 0);
    expect(counts[1]).toBeGreaterThan(counts[2] ?? 0);
    expect(run(head, 0.012, 'y')).toEqual(run(head, 0.012, 'y'));
  });
});
