import { describe, expect, test } from 'bun:test';
import { dot, normalize, sub, type Vec3 } from '../core/index.ts';
import { checkGroomOps, childrenFor, type GroomGuide, type GroomOp, opMask } from './groom-ops.ts';
import { applyGroomOps, curveLength, lockOf } from './groom-ops-apply.ts';

// A 10 cm ball scalp; guides from its top cap, each leaving the skin at 30° and lying back (-X).
const R = 0.1;
const ball = (p: Vec3): number => Math.hypot(...p) - R;
function guides(n = 6, len = 0.08, pts = 9): GroomGuide[] {
  const out: GroomGuide[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = ((i - (n - 1) / 2) / n) * 1.2;
      const b = ((j - (n - 1) / 2) / n) * 1.2;
      const nrm = normalize([Math.sin(a), Math.sin(b), 1]);
      const root: Vec3 = [nrm[0] * (R - 0.002), nrm[1] * (R - 0.002), nrm[2] * (R - 0.002)];
      const back = normalize([-1, 0, 0.6]);
      const points: Vec3[] = [];
      for (let k = 0; k < pts; k++) {
        const s = (k / (pts - 1)) * len;
        points.push([
          root[0] + back[0] * s + nrm[0] * s * 0.3,
          root[1] + back[1] * s + nrm[1] * s * 0.3,
          root[2] + back[2] * s + nrm[2] * s * 0.3,
        ]);
      }
      out.push({ points, normal: nrm });
    }
  return out;
}
const rootAngle = (g: GroomGuide): number =>
  Math.acos(dot(normalize(sub(g.points[1] ?? [0, 0, 0], g.points[0] ?? [0, 0, 0])), g.normal));
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
/** Mean distance of each guide's tip from its lock's mean tip. */
function spread(gs: readonly GroomGuide[], locks: number): number {
  const lock = lockOf(gs, locks, 0);
  const tips = gs.map((g) => g.points.at(-1) ?? [0, 0, 0]);
  return mean(
    tips.map((t, i) => {
      const m = tips.filter((_, j) => lock[j] === lock[i]);
      const c = m.reduce(
        (s, q) => [s[0] + q[0] / m.length, s[1] + q[1] / m.length, s[2] + q[2] / m.length],
        [0, 0, 0],
      );
      return Math.hypot(t[0] - c[0], t[1] - c[1], t[2] - c[2]);
    }),
  );
}
const apply = (ops: GroomOp[], gs = guides()) => applyGroomOps(gs, ops, { field: ball });

describe('groom ops: validation (failure first)', () => {
  const bad: [GroomOp, RegExp][] = [
    [{ op: 'comb', toward: [0, 0, 0], strength: 1 }, /non-zero direction/],
    [{ op: 'puff', amount: 2 }, /amount is 0..1/],
    [{ op: 'cut' }, /length .*or by a plane/],
    [{ op: 'cut', plane: { at: [0, 0, 0.05], normal: [Number.NaN, 0, 1] } }, /finite non-zero/],
    [{ op: 'cut', plane: { at: [0, 0, 0.05], normal: [0, 0, Infinity] } }, /finite non-zero/],
    [{ op: 'grow', factor: 0.5 }, /grow by a factor/],
    [{ op: 'shrink', factor: 2 }, /shrink by a factor/],
    [{ op: 'clump', locks: 0, strength: 1 }, /locks is a whole number/],
    [{ op: 'pinch', locks: 3, strength: 1.5 }, /strength 0..1/],
    [{ op: 'curl', radius: 0, turns: 2 }, /radius/],
    [{ op: 'frizz', amount: 1 }, /0..5 cm/],
    [{ op: 'smooth', iterations: 0.5 }, /whole number 1..100/],
    [{ op: 'density', perCm2: 0 }, /per cm²/],
    [{ op: 'slide', by: [1, 0, 0] }, /≤ 10 cm/],
    [{ op: 'add', count: 0 }, /1..10000/],
    [{ op: 'delete' }, /region, or a random fraction/],
    [{ op: 'frizz', amount: 0.001, seed: 0.5 }, /integer seed/],
    [{ op: 'puff', amount: 0.5, region: 'crown' }, /'crown' is not a zone/],
  ];
  for (const [op, why] of bad)
    test(`${op.op} refuses ${why.source}`, () => {
      const e = (() => {
        try {
          checkGroomOps([op]);
        } catch (x) {
          return x as { message: string; fix?: string };
        }
      })();
      expect(e?.message).toContain('T3D_RECIPE_INVALID');
      expect(`${e?.message} ${e?.fix}`).toMatch(why);
    });
  test('a named zone resolves; an empty list is valid', () => {
    expect(() =>
      checkGroomOps([{ op: 'puff', amount: 0.5, region: 'crown' }], { crown: ball }),
    ).not.toThrow();
    expect(() => checkGroomOps([])).not.toThrow();
  });
});

describe('opMask', () => {
  test('a 4 mm ramp centred on the region boundary: 1 at 2 mm inside, ½ on it, 0 at 2 mm out', () => {
    const at = (d: number): number | undefined =>
      opMask({ op: 'puff', amount: 1, region: () => d }, [
        { normal: [0, 0, 1], points: [[0, 0, 0]] },
      ])[0];
    expect(at(-0.002)).toBe(1);
    expect(at(0)).toBe(0.5);
    expect(at(0.001)).toBeCloseTo(0.25, 9);
    expect(at(0.002)).toBe(0);
  });
});

describe('groom ops: each op does what it says', () => {
  test('cut: no guide longer than the length; a plane cut keeps the root side', () => {
    expect(Math.max(...guides().map((g) => curveLength(g.points)))).toBeGreaterThan(0.05);
    const cut = apply([{ op: 'cut', length: 0.05 }]);
    expect(Math.max(...cut.map((g) => curveLength(g.points)))).toBeLessThanOrEqual(0.05 + 1e-6);
    const plane = apply([{ op: 'cut', plane: { at: [-0.02, 0, 0], normal: [-1, 0, 0] } }]);
    for (const g of plane)
      for (const q of g.points) expect(q[0]).toBeGreaterThanOrEqual(-0.02 - 1e-6);
  });
  test('puff raises the root angle (closer to the scalp normal)', () => {
    const before = mean(guides().map(rootAngle));
    expect(mean(apply([{ op: 'puff', amount: 0.8 }]).map(rootAngle))).toBeLessThan(before * 0.7);
  });
  test('grow / shrink scale the length; a region limits them', () => {
    const L = mean(guides().map((g) => curveLength(g.points)));
    expect(
      mean(apply([{ op: 'grow', factor: 1.5 }]).map((g) => curveLength(g.points))),
    ).toBeGreaterThan(L * 1.3);
    expect(
      mean(apply([{ op: 'shrink', factor: 0.5 }]).map((g) => curveLength(g.points))),
    ).toBeLessThan(L * 0.7);
    const front = (p: Vec3) => -p[0];
    const out = apply([{ op: 'shrink', factor: 0.5, region: front }]);
    const back = out.filter((g) => (g.points[0]?.[0] ?? 0) < -0.01);
    expect(Math.min(...back.map((g) => curveLength(g.points)))).toBeGreaterThan(L * 0.95);
  });
  test('pinch and clump reduce lock spread', () => {
    const s0 = spread(guides(), 6);
    expect(spread(apply([{ op: 'clump', locks: 6, strength: 0.8 }]), 6)).toBeLessThan(s0 * 0.5);
    expect(spread(apply([{ op: 'pinch', locks: 6, strength: 0.8 }]), 6)).toBeLessThan(s0 * 0.5);
  });
  test('comb turns the hair toward the vector', () => {
    const lean = (gs: GroomGuide[]) =>
      mean(gs.map((g) => (g.points.at(-1)?.[1] ?? 0) - (g.points[0]?.[1] ?? 0)));
    expect(lean(apply([{ op: 'comb', toward: [0, 1, 0], strength: 0.7 }]))).toBeGreaterThan(
      lean(guides()) + 0.02,
    );
  });
  test('curl and frizz move the strand off its line, the root stays put', () => {
    const g0 = guides();
    for (const op of [
      { op: 'curl', radius: 0.006, turns: 3, seed: 1 },
      { op: 'frizz', amount: 0.004, seed: 1 },
    ] as GroomOp[]) {
      const g1 = apply([op], g0);
      const moved = mean(
        g1.map((g, i) =>
          Math.hypot(...sub(g.points[5] ?? [0, 0, 0], g0[i]?.points[5] ?? [0, 0, 0])),
        ),
      );
      expect(moved).toBeGreaterThan(0.001);
      expect(g1[0]?.points[0]).toEqual(g0[0]?.points[0] as Vec3);
    }
  });
  test('smooth straightens a frizzed strand', () => {
    const rough = apply([{ op: 'frizz', amount: 0.006, seed: 3 }]);
    const bend = (gs: GroomGuide[]) => mean(gs.map((g) => curveLength(g.points)));
    expect(bend(applyGroomOps(rough, [{ op: 'smooth', iterations: 10 }]))).toBeLessThan(
      bend(rough),
    );
  });
  test('slide moves roots along the scalp and keeps them buried', () => {
    const out = apply([{ op: 'slide', by: [0.01, 0, 0] }]);
    for (const g of out)
      expect(Math.abs(ball(g.points[0] ?? [0, 0, 0]) + 0.002)).toBeLessThan(5e-4);
    expect(mean(out.map((g) => g.points[0]?.[0] ?? 0))).toBeGreaterThan(
      mean(guides().map((g) => g.points[0]?.[0] ?? 0)) + 0.005,
    );
  });
  test('add and delete change the guide count by region; density sets children', () => {
    expect(apply([{ op: 'add', count: 10, seed: 2 }]).length).toBe(46);
    const left = (p: Vec3) => -p[1];
    const kept = apply([{ op: 'delete', region: left }]);
    expect(kept.length).toBeLessThan(36);
    expect(kept.every((g) => (g.points[0]?.[1] ?? 0) <= 0.004)).toBe(true);
    expect(childrenFor([{ op: 'density', perCm2: 50 }], 100, 0.02, 4)).toBe(100);
    expect(childrenFor([], 100, 0.02, 4)).toBe(4);
  });
  test('no point past the root ends inside the scalp; same ops, same bytes', () => {
    const ops: GroomOp[] = [
      { op: 'comb', toward: [0, 0, -1], strength: 0.9 },
      { op: 'clump', locks: 5, strength: 0.6, seed: 4 },
      { op: 'frizz', amount: 0.003, seed: 9 },
    ];
    const a = apply(ops);
    for (const g of a) for (const q of g.points.slice(1)) expect(ball(q)).toBeGreaterThan(0.0009);
    expect(JSON.stringify(apply(ops))).toBe(JSON.stringify(a));
  });
  test("stage 'guide' leaves strand ops (clump, curl, frizz) to Blender", () => {
    const g0 = guides();
    const out = applyGroomOps(g0, [{ op: 'frizz', amount: 0.004, seed: 1 }], { stage: 'guide' });
    expect(out).toEqual(g0);
    expect(opMask({ op: 'puff', amount: 1, region: (p) => p[1] }, g0).some((w) => w === 0)).toBe(
      true,
    );
  });
});
