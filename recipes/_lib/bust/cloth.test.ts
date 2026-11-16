import { describe, expect, it } from 'bun:test';
import { foldField } from './cloth-folds.ts';
import { clothField, edgeBand, memo, smax, thickness } from './cloth-garment.ts';
import { collarBand, neckline, neckSection, outsideNeck } from './cloth-neck.ts';
import { drag, hang, sag, walk, zigzag } from './cloth-paths.ts';
import { surface, type V } from './kit.ts';

const ball =
  (r: number): ((p: V) => number) =>
  (p) =>
    Math.hypot(p[0], p[1], p[2]) - r;
const line: V[] = [
  [0, 0, 0.1],
  [0, 0, -0.1],
];

describe('cloth folds', () => {
  it('a valley sinks and a ridge rises at its line, and nothing moves a width away', () => {
    const f = foldField([
      { path: line, width: 0.02, amp: 0.005, fade: [0, 0] },
      { path: line.map((p): V => [0.1, 0, p[2]]), width: 0.02, amp: -0.004, fade: [0, 0] },
    ]);
    expect(f.h([0, 0, 0])).toBeCloseTo(0.005, 6);
    expect(f.h([0.1, 0, 0])).toBeCloseTo(-0.004, 6);
    expect(f.h([0.05, 0, 0])).toBe(0);
  });
  it('crossing ridges take the higher, never their sum (no lump where folds meet)', () => {
    const f = foldField([
      { path: line, width: 0.02, amp: 0.005, fade: [0, 0] },
      { path: line.map((p): V => [p[2], 0, 0]), width: 0.02, amp: 0.004, fade: [0, 0] },
    ]);
    expect(f.h([0, 0, 0])).toBeCloseTo(0.005, 6);
  });
  it('fades in along its length', () => {
    const f = foldField([{ path: line, width: 0.02, amp: 0.005, fade: [0.5, 0] }]);
    expect(f.h([0, 0, 0.1])).toBe(0);
    expect(f.h([0, 0, -0.1])).toBeCloseTo(0.005, 6);
  });
  it('is never steeper than its declared bound (the mesher culls by it)', () => {
    const f = foldField([
      { path: line, width: 0.012, amp: 0.006, widen: 2 },
      { path: line.map((p): V => [0.01, 0, p[2]]), width: 0.01, amp: -0.004 },
    ]);
    let worst = 0;
    const e = 1e-5;
    for (let x = -0.03; x <= 0.04; x += 0.0013)
      for (let z = -0.1; z <= 0.1; z += 0.0071) {
        const g = (f.h([x + e, 0, z]) - f.h([x - e, 0, z])) / (2 * e);
        const gz = (f.h([x, 0, z + e]) - f.h([x, 0, z - e])) / (2 * e);
        worst = Math.max(worst, Math.hypot(g, gz));
      }
    expect(worst).toBeGreaterThan(0.1);
    expect(worst).toBeLessThanOrEqual(f.lipschitz);
  });
});

describe('cloth garment', () => {
  const body = ball(0.1);
  const region = (p: V): number => -p[2];
  it('pushes the body out by its thickness inside its region only', () => {
    const f = clothField({ body, thick: 0.01, region });
    expect(f([0, 0, 0.105])).toBeLessThan(0);
    expect(f([0, 0, 0.115])).toBeGreaterThan(0);
    expect(f([0, 0, -0.105])).toBeGreaterThan(0);
  });
  it('rolls the hem: thicker at the edge than across the panel', () => {
    const { t } = thickness({
      body,
      thick: 0.01,
      region,
      hem: { width: 0.02, lift: 0.004, roll: 0.004 },
    });
    expect(t([0.1, 0, 0])).toBeCloseTo(0.014, 6);
    expect(t([0, 0, 0.1])).toBeCloseTo(0.01, 6);
  });
  it('feathers to nothing at a gathered edge, ending just under the skin', () => {
    const { t } = thickness({
      body,
      thick: 0.01,
      region,
      feather: { region: (p) => p[0], width: 0.03 },
    });
    // A hair under the skin at the edge: the skin, not a film of cloth, shows there.
    expect(t([0, 0, 0.1])).toBeLessThan(0);
    expect(t([0, 0, 0.1])).toBeGreaterThan(-0.001);
    expect(t([-0.04, 0, 0.09])).toBeCloseTo(0.0097, 6);
  });
  it('drapes straight: below the top it stands off a hollow back on the plane', () => {
    const waist = (p: V): number => Math.hypot(p[0], p[1]) - (0.05 + Math.max(0, p[2]) * 0.5);
    const free = clothField({ body: waist, thick: 0.005, region: () => -1 });
    const hung = clothField({
      body: waist,
      thick: 0.005,
      region: () => -1,
      drape: { x: -0.08, lean: 0.2, top: 0.1, wrap: 0, halfY: 0.1 },
    });
    expect(free([-0.08, 0, 0])).toBeGreaterThan(0);
    expect(hung([-0.08, 0, 0])).toBeLessThan(0);
    // Leaning back as it falls: 10 cm down it stands 2 cm further out.
    expect(hung([-0.098, 0, 0])).toBeLessThan(0);
    expect(hung([-0.105, 0, 0.05])).toBeGreaterThan(0);
  });
  it('smax never undercuts the max and a band is ≤ 0 only within its range', () => {
    expect(smax(0.01, -0.02, 0.004)).toBe(0.01);
    const band = edgeBand(region, 0.002, 0.01);
    expect(band([0, 0, 0.005])).toBeLessThan(0);
    expect(band([0, 0, 0.02])).toBeGreaterThan(0);
    expect(band([0, 0, -0.005])).toBeGreaterThan(0);
  });
  it('memo answers again for the same point, freshly for a new one', () => {
    let calls = 0;
    const f = memo((p) => {
      calls++;
      return p[0];
    });
    f([1, 0, 0]);
    f([1, 0, 0]);
    expect(calls).toBe(1);
    expect(f([2, 0, 0])).toBe(2);
  });
});

describe('fold paths walk on the body', () => {
  const s = surface(ball(0.1));
  const on = (p: V, lift: number): number => Math.abs(Math.hypot(p[0], p[1], p[2]) - 0.1 - lift);
  it('hangs pipe folds down under gravity, a valley between each pair, lifted off the skin', () => {
    const folds = hang(
      s,
      [
        [0.05, 0.02, 0.08],
        [0.05, 0.05, 0.08],
      ],
      [0.08, 0.08],
      { amp: 0.004, width: 0.02, lift: 0.005 },
    );
    expect(folds.map((f) => Math.sign(f.amp))).toEqual([1, -1, 1]);
    for (const f of folds) {
      for (const p of f.path) expect(on(p, 0.005)).toBeLessThan(1e-3);
      const [a, b] = [f.path[0], f.path[f.path.length - 1]];
      expect((b?.[2] ?? 0) < (a?.[2] ?? 0)).toBe(true);
    }
  });
  it('drags tension folds toward each anchor; zigzags and sags alternate ridge and valley', () => {
    const d = drag(s, [0.1, 0, 0], [[0, 0.1, 0]], { amp: 0.003, width: 0.01, lift: 0 });
    const end = d[0]?.path[d[0].path.length - 1] ?? [0, 0, 0];
    expect(Math.hypot(end[0], end[1] - 0.1, end[2])).toBeLessThan(0.02);
    const z = zigzag(s, [0.1, 0, 0.02], [0.1, 0, -0.02], [0, 1, 0], 4, 0.01, {
      amp: 0.002,
      width: 0.01,
      lift: 0,
    });
    expect(z.map((f) => Math.sign(f.amp))).toEqual([1, -1, 1, -1]);
    const u = sag(s, [-0.05, 0.08, 0.05], [-0.05, -0.08, 0.05], 0.03, 2, {
      amp: 0.003,
      width: 0.01,
      lift: 0,
    });
    const mid = u[1]?.path[6] ?? [0, 0, 1];
    expect(mid[2]).toBeLessThan(0.05);
  });
  it('a walk stops when its direction leaves the surface', () => {
    expect(walk(s, [0, 0, 0.1], () => [0, 0, 1], 0.05, 5, 0)).toHaveLength(1);
  });
});

describe('cloth at the neck', () => {
  // A neck: a vertical cylinder r = 4 cm; seam: the plane z = 0.
  const neck = (p: V): number => Math.hypot(p[0], p[1]) - 0.04;
  const seam = { field: (p: V) => p[2], at: [0, 0, 0] as V, n: [0, 0, 1] as V };
  const n = neckSection(neck, seam, 0.06);
  it('finds the neck outline on the skin at the seam', () => {
    for (const a of [0, 1, 2, 3]) expect(n.radius(a)).toBeCloseTo(0.04, 3);
    expect(outsideNeck(n, 0)([0.05, 0, 0])).toBeGreaterThan(0);
  });
  it('a neckline covers below the seam and outside the neck, never the head above the cap', () => {
    const f = neckline(n, 0.005, 0.002, 0.03);
    expect(f([0.03, 0, -0.01])).toBeLessThan(0);
    expect(f([0.03, 0, 0.01])).toBeGreaterThan(0);
    expect(f([0.08, 0, 0.01])).toBeLessThan(0);
    expect(f([0.08, 0, 0.05])).toBeGreaterThan(0);
  });
  it('a collar band stands from under the seam to over it, round the neck only', () => {
    const c = collarBand(n, 0.005, 0.015, 0.01);
    expect(c([0.04, 0, 0.01])).toBeLessThan(0);
    expect(c([0.04, 0, 0.02])).toBeGreaterThan(0);
    expect(c([0.09, 0, 0.01])).toBeGreaterThan(0);
  });
});
