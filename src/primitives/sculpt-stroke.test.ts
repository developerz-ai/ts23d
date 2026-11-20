import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { openEdges } from './closed.ts';
import { type SculptEdit, sculpt, sculptField } from './sculpt.ts';
import {
  compileStroke,
  probeLipschitz,
  type SculptStroke,
  type StrokeBrush,
} from './sculpt-stroke.ts';
import { compile, fold } from './sculpt-tree.ts';
import { shapes } from './sdf-ops.ts';

const SKIN: Vec3 = [0.6, 0.5, 0.4];
const BALL: SculptEdit = { shape: 'sphere', at: [0, 0, 0], size: 0.1 };
const BOUNDS: [Vec3, Vec3] = [
  [-0.14, -0.14, -0.14],
  [0.14, 0.14, 0.14],
];
/** An arc on the ball's surface, tapered: the stroke every brush is tested on. */
const ARC: Vec3[] = [0, 1, 2, 3, 4].map((i) => {
  const a = -0.6 + 0.3 * i;
  return [0.1 * dmath.cos(a), 0.1 * dmath.sin(a), 0.01 * i] as Vec3;
});
const stroke = (brush: StrokeBrush, depth = 0.01): SculptStroke => ({
  stroke: brush,
  path: ARC,
  radius: [0.025, 0.012],
  depth,
  ...(brush === 'flatten' ? { normal: [1, 0, 0] as Vec3 } : {}),
});
const ball = (p: Vec3): number => shapes.sphere(p[0], p[1], p[2], 0.1);

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** Largest |radius − 0.1| among vertices within `r` of point q. */
const pushAt = (m: Mesh, q: Vec3, r: number): number => {
  let best = 0;
  for (let i = 0; i < m.positions.length; i += 3) {
    const p: Vec3 = [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    if (dmath.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > r) continue;
    const d = dmath.norm(p) - 0.1;
    if (Math.abs(d) > Math.abs(best)) best = d;
  }
  return best;
};

describe('sculpt strokes', () => {
  it('the probe catches an under-declared Lipschitz bound', () => {
    // Untapered clay: its declared bound is near tight, so 80 % of it is measurably too small.
    const s = compileStroke({ ...stroke('clay', 0.03), radius: 0.02 }, 'test', false);
    const f = (p: Vec3): number => s.apply(p, ball(p));
    expect(probeLipschitz(f, BOUNDS, 1, 40).ok).toBe(false);
    expect(probeLipschitz(f, BOUNDS, 1 + 0.8 * s.extra, 40).ok).toBe(false);
    expect(probeLipschitz(f, BOUNDS, 1 + s.extra, 40).ok).toBe(true);
  });

  it('every brush stays within its declared bound, deep and mirrored too', () => {
    for (const brush of ['crease', 'clay', 'inflate', 'flatten', 'pinch'] as const)
      for (const mirror of [false, true]) {
        const s = compileStroke(stroke(brush, 0.04), brush, mirror);
        const r = probeLipschitz((p) => s.apply(p, ball(p)), BOUNDS, 1 + s.extra, 28);
        expect({ brush, mirror, ok: r.ok }).toEqual({ brush, mirror, ok: true });
        expect(r.worst).toBeGreaterThan(1);
      }
  });

  it('is inert outside its influence sphere (returns the input bit for bit)', () => {
    const s = compileStroke(stroke('clay'), 'test', false);
    const rng = createRng(2);
    for (let i = 0; i < 2000; i++) {
      const p: Vec3 = [rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)];
      if (dmath.hypot(p[0] - s.c[0], p[1] - s.c[1], p[2] - s.c[2]) <= s.r) continue;
      const d = rng.range(-1, 1);
      expect(s.apply(p, d)).toBe(d);
    }
  });

  it('rejects bad strokes with T3D_RECIPE_INVALID and a fix', () => {
    const bad: SculptStroke[] = [
      { ...stroke('crease'), path: [[0, 0, 0]] },
      {
        ...stroke('crease'),
        path: [
          [0, 0, 0],
          [0, 0, 0],
        ],
      },
      { ...stroke('crease'), radius: 0 },
      { ...stroke('crease'), depth: -0.01 },
      { stroke: 'flatten', path: ARC, radius: 0.02, depth: 0.01 },
    ];
    for (const e of bad) {
      const err = fails(() => compileStroke(e, 'edit 1', false));
      expect(err.code).toBe('T3D_RECIPE_INVALID');
      expect(err.fix.length).toBeGreaterThan(5);
    }
    expect(() => sculpt({ edits: [stroke('clay')], resolution: 0.01, color: SKIN })).toThrow(
      'no add edits',
    );
  });

  it('crease pushes in and clay builds out; the meshes stay closed', () => {
    const mid = ARC[2] ?? [0.1, 0, 0];
    const crease = sculpt({ edits: [BALL, stroke('crease')], resolution: 0.004, color: SKIN });
    const clay = sculpt({ edits: [BALL, stroke('clay')], resolution: 0.004, color: SKIN });
    // A V-groove is sharper than a 4 mm cell: the mesh catches at least 40 % of its depth.
    expect(pushAt(crease, mid, 0.008)).toBeLessThan(-0.004);
    expect(pushAt(clay, mid, 0.015)).toBeGreaterThan(0.008);
    expect(openEdges(crease)).toBe(0);
    expect(openEdges(clay)).toBe(0);
  });

  it('sculptField sums stroke costs into its Lipschitz bound (1.25 without strokes)', () => {
    expect(sculptField([BALL], { color: SKIN }).lipschitz).toBe(1.25);
    const one = compileStroke(stroke('pinch'), 'x', false).extra;
    const f = sculptField([BALL, stroke('pinch'), stroke('pinch')], { color: SKIN });
    expect(f.lipschitz).toBeCloseTo(1.25 + 2 * one, 12);
  });

  it('sparse fold is bit-identical with strokes and the cubic kernel, in groups too', () => {
    const edits: SculptEdit[] = [
      BALL,
      {
        shape: 'roundCone',
        at: [0.05, 0, 0.05],
        to: [0.14, 0.02, 0.1],
        size: [0.03, 0.012],
        blend: 0.02,
      },
      {
        shape: 'superellipsoid',
        at: [-0.06, 0.04, 0],
        size: [0.03, 0.02, 0.04],
        power: 5,
        blend: 0.01,
        kernel: 'quad',
      },
      stroke('crease'),
      {
        group: [
          BALL,
          stroke('inflate', 0.02),
          { shape: 'sphere', at: [0, 0, 0.1], size: 0.04, op: 'subtract', blend: 0.01 },
        ],
        blend: 0.015,
      },
      stroke('flatten'),
      { shape: 'sphere', at: [0, 0.05, -0.08], size: 0.03, op: 'subtract', blend: 0.012 },
    ];
    const nodes = compile(edits, SKIN, true, 'sculpt', 'cubic');
    const rng = createRng(9);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    for (let i = 0; i < 20000; i++) {
      const p: Vec3 = [rng.range(-0.2, 0.2), rng.range(-0.2, 0.2), rng.range(-0.2, 0.2)];
      expect(fold(nodes, p, null, SKIN, true)).toBe(fold(nodes, p, null, SKIN, false));
      fold(nodes, p, a, SKIN, true);
      fold(nodes, p, b, SKIN, false);
      expect([...a]).toEqual([...b]);
    }
  });

  it("kernel 'cubic' changes the field only inside the blend band", () => {
    const edits: SculptEdit[] = [
      BALL,
      { shape: 'sphere', at: [0.12, 0, 0], size: 0.05, blend: 0.03 },
    ];
    const quad = sculptField(edits, { color: SKIN }).field;
    const cubic = sculptField(edits, { color: SKIN, kernel: 'cubic' }).field;
    expect(cubic([-0.1, 0, 0])).toBe(quad([-0.1, 0, 0]));
    expect(cubic([0.085, 0, 0.06])).not.toBe(quad([0.085, 0, 0.06]));
  });
});
