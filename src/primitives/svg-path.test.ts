import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec2 } from '../core/index.ts';
import { svgShape } from './svg-doc.ts';
import { parsePath } from './svg-path.ts';

const code = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code}|${e.fix.length > 0}` : `other: ${String(e)}`;
  }
  return 'no throw';
};

/** Distance from p to the polyline. */
const toPolyline = (p: Vec2, pts: readonly Vec2[]): number => {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i] ?? [0, 0];
    const b = pts[i + 1] ?? a;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
    );
    best = Math.min(best, Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t));
  }
  return best;
};

describe('parsePath', () => {
  it('throws T3D_SVG_INVALID with a fix on malformed data', () => {
    for (const d of [
      'L 1 1',
      'M 0 0 X 1 1',
      'M 0 0 L 1',
      'M 0 0 C 1 1 2 2',
      'M 0 0 A 1 1 0 2 0 3 3',
      'M',
      'M 0 0 L 1 1 Z 4',
    ])
      expect([d, code(() => parsePath(d, 0.01))]).toEqual([d, 'T3D_SVG_INVALID|true']);
  });

  it('reads absolute, relative, H/V, implicit lineto and compact numbers alike', () => {
    const a = parsePath('M0 0 L10 0 L10 10 L0 10 Z', 0.01);
    const b = parsePath('m0,0 10,0v10h-10z', 0.01);
    const c = parsePath('M0-0l10 0 0 10-10 0Z', 0.01);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a).toEqual([
      {
        closed: true,
        points: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      },
    ]);
  });

  it('keeps open subpaths open and splits on M', () => {
    const cs = parsePath('M0 0 L5 0 M10 0 L10 5 L12 5 Z', 0.01);
    expect(cs.map((c) => [c.closed, c.points.length])).toEqual([
      [false, 2],
      [true, 3],
    ]);
  });

  it('flattens a cubic within tolerance (and finer tolerance gives more points)', () => {
    const cubic = (t: number): Vec2 => {
      const u = 1 - t;
      return [
        3 * u * u * t * 0 + 3 * u * t * t * 100 + t * t * t * 100,
        3 * u * u * t * 100 + 3 * u * t * t * 100,
      ];
    };
    for (const tol of [1, 0.1, 0.01]) {
      const [c] = parsePath('M0 0 C0 100 100 100 100 0', tol);
      const pts = c?.points ?? [];
      let worst = 0;
      for (let i = 0; i <= 200; i++) worst = Math.max(worst, toPolyline(cubic(i / 200), pts));
      expect(worst).toBeLessThanOrEqual(tol);
    }
    const n = (tol: number): number =>
      parsePath('M0 0 C0 100 100 100 100 0', tol)[0]?.points.length ?? 0;
    expect(n(0.01)).toBeGreaterThan(n(1));
  });

  it('flattens arcs onto the circle within tolerance, honouring the flags', () => {
    // Half circle of radius 50 from (0, 50) to (100, 50) about (50, 50); sweep 1 goes through y = 0.
    for (const [flags, side] of [
      ['0 1', -1],
      ['0 0', 1],
    ] as const) {
      const pts = parsePath(`M0 50 A50 50 0 ${flags} 100 50`, 0.05)[0]?.points ?? [];
      for (const p of pts)
        expect(Math.abs(Math.hypot(p[0] - 50, p[1] - 50) - 50)).toBeLessThan(1e-9);
      const mid = pts[Math.floor(pts.length / 2)] ?? [0, 0];
      expect(Math.sign(mid[1] - 50)).toBe(side);
      // Chord sagitta ≤ tol: consecutive points no further apart than 2 √(2 r tol).
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1] ?? [0, 0];
        const b = pts[i] ?? [0, 0];
        expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThanOrEqual(
          2 * Math.sqrt(2 * 50 * 0.05) + 1e-9,
        );
      }
    }
    // Compact flags with no separators: "a1 1 0 011 1".
    expect(parsePath('M0 0 a1 1 0 011 1', 0.01)[0]?.points.at(-1)).toEqual([1, 1]);
  });

  it('reflects S/T control points', () => {
    const s = parsePath('M0 0 C0 10 10 10 10 0 S20 -10 20 0', 0.001)[0]?.points ?? [];
    const c = parsePath('M0 0 C0 10 10 10 10 0 C10 -10 20 -10 20 0', 0.001)[0]?.points ?? [];
    expect(s).toEqual(c);
  });
});

describe('svgShape', () => {
  it('rejects transforms, missing size and empty drawings', () => {
    expect(
      code(() =>
        svgShape('<svg><rect width="1" height="1" transform="rotate(4)"/></svg>', { scale: 1 }),
      ),
    ).toBe('T3D_SVG_INVALID|true');
    expect(code(() => svgShape('M0 0 L1 0 L1 1 Z'))).toBe('T3D_SVG_INVALID|true');
    expect(code(() => svgShape('<svg viewBox="0 0 10 10"></svg>', { scale: 1 }))).toBe(
      'T3D_SVG_INVALID|true',
    );
    expect(
      code(() =>
        svgShape('<svg viewBox="0 0 -1 10"><rect width="1" height="1"/></svg>', { scale: 1 }),
      ),
    ).toBe('T3D_SVG_INVALID|true');
  });

  it('maps the viewBox to metres, Y up, origin at the paper bottom centre', () => {
    const s = svgShape(
      '<svg viewBox="0 0 200 100"><rect x="50" y="0" width="100" height="100"/></svg>',
      {
        size: 2,
      },
    );
    expect([s.min, s.max]).toEqual([
      [-0.5, 0],
      [0.5, 1],
    ]);
  });

  it('reads polygon, circle and ellipse; LOD coarsens curves', () => {
    const svg =
      '<svg viewBox="-10 -10 20 20"><polygon points="0,-5 5,5 -5,5"/><circle r="8"/><ellipse rx="9" ry="3"/></svg>';
    const fine = svgShape(svg, { scale: 0.1, origin: 'centre' });
    const coarse = svgShape(svg, { scale: 0.1, origin: 'centre', lod: 2 });
    expect(fine.contours.length).toBe(3);
    const count = (s: typeof fine): number => s.contours.reduce((n, c) => n + c.points.length, 0);
    expect(count(coarse)).toBeLessThan(count(fine));
    expect(fine.max[0]).toBeCloseTo(0.9, 6);
  });

  it('is deterministic', () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M1 1 Q5 9 9 1 A4 4 0 0 1 1 1 Z"/></svg>';
    expect(svgShape(svg, { size: 1 })).toEqual(svgShape(svg, { size: 1 }));
  });
});
