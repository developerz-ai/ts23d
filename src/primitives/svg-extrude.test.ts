import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError } from '../core/index.ts';
import { nonManifoldEdges, openEdges, windingFlips } from './closed.ts';
import { extrudeSvg } from './svg-extrude.ts';
import { latheSvg } from './svg-lathe.ts';
import { earClip, fillRegion, regions, signedArea } from './svg-triangulate.ts';

const WHITE: [number, number, number] = [1, 1, 1];
/** A 0.8 m square with a 0.4 m square hole, on 1 m paper. */
const FRAME =
  '<svg viewBox="0 0 100 100"><path d="M10 10 H90 V90 H10 Z M30 30 V70 H70 V30 Z"/></svg>';
const GEAR = `<svg viewBox="-50 -50 100 100"><path d="${Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  const p = (r: number, da: number): string =>
    `${(r * Math.cos(a + da)).toFixed(3)} ${(r * Math.sin(a + da)).toFixed(3)}`;
  return `${i === 0 ? 'M' : 'L'}${p(40, -0.12)} L${p(48, -0.08)} L${p(48, 0.08)} L${p(40, 0.12)}`;
}).join(' ')} Z"/><circle r="14"/><circle cx="25" r="5"/><circle cx="-25" r="5"/></svg>`;

/** Signed volume (> 0 when wound outward). */
const volume = (m: Mesh): number => {
  let v = 0;
  const P = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.indices[t + k] ?? 0) * 3);
    const [ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0, cx = 0, cy = 0, cz = 0] = [
      a,
      a,
      a,
      b,
      b,
      b,
      c,
      c,
      c,
    ].map((o, i) => P[(o ?? 0) + (i % 3)] ?? 0);
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
};

describe('svg triangulation', () => {
  it('ear-clips nothing from a degenerate loop instead of looping forever', () => {
    expect(
      earClip([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toEqual([]);
  });

  it('fills a shape with a hole: area = outer − hole, all triangles CCW', () => {
    const outer: [number, number][] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];
    const hole: [number, number][] = [
      [1, 1],
      [1, 3],
      [3, 3],
      [3, 1],
    ];
    const [r] = regions([outer, hole]);
    expect(r?.holes.length).toBe(1);
    const { pts, tris } = fillRegion(r ?? { outer: [], holes: [] });
    const areas = tris.map(([a, b, c]) =>
      signedArea([pts[a] ?? [0, 0], pts[b] ?? [0, 0], pts[c] ?? [0, 0]]),
    );
    expect(areas.every((a) => a > 0)).toBe(true);
    expect(areas.reduce((s, a) => s + a, 0)).toBeCloseTo(16 - 4, 9);
  });

  it('treats a contour inside a hole as a new island (even-odd)', () => {
    const sq = (s: number): [number, number][] => [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ];
    const rs = regions([sq(3), sq(2), sq(1)]);
    expect(rs.map((r) => r.holes.length)).toEqual([1, 0]);
  });
});

describe('extrudeSvg', () => {
  it('rejects a bad depth or a bevel too wide for it', () => {
    for (const o of [{ depth: 0 }, { depth: 0.1, bevel: 0.05 }]) {
      let c = '';
      try {
        extrudeSvg(FRAME, { size: 1, color: WHITE, ...o });
      } catch (e) {
        c = e instanceof Ts23dError ? e.code : 'other';
      }
      expect(c).toBe('T3D_RECIPE_INVALID');
    }
  });

  it('is watertight and wound outward, with and without a bevel, in every view', () => {
    for (const view of ['front', 'side', 'top'] as const)
      for (const bevel of [0, 0.01]) {
        for (const svg of [FRAME, GEAR]) {
          const m = extrudeSvg(svg, { size: 1, depth: 0.1, bevel, view, color: WHITE });
          expect([view, bevel, openEdges(m), nonManifoldEdges(m), windingFlips(m)]).toEqual([
            view,
            bevel,
            0,
            0,
            0,
          ]);
          expect(volume(m)).toBeGreaterThan(0);
        }
      }
  });

  it('has the drawn area times depth as its volume (hole subtracted)', () => {
    const m = extrudeSvg(FRAME, { size: 1, depth: 0.1, color: WHITE });
    expect(volume(m)).toBeCloseTo((0.64 - 0.16) * 0.1, 9);
    // A bevel only shaves the edges: volume drops, bounds stay.
    const b = extrudeSvg(FRAME, { size: 1, depth: 0.1, bevel: 0.01, color: WHITE });
    expect(volume(b)).toBeLessThan(volume(m));
    expect(boundsOf(b)).toEqual(boundsOf(m));
  });

  it('places views as documented: front faces +X, side spans X, top stands on z = 0', () => {
    const r = (v: number): number => Math.round(v * 1e5) / 1e5;
    const bb = (view: 'front' | 'side' | 'top'): number[][] => {
      const { min, max } = boundsOf(extrudeSvg(FRAME, { size: 1, depth: 0.1, view, color: WHITE }));
      return [min.map(r), max.map(r)];
    };
    expect(bb('front')).toEqual([
      [-0.05, -0.4, 0.1],
      [0.05, 0.4, 0.9],
    ]);
    expect(bb('side')).toEqual([
      [-0.4, -0.05, 0.1],
      [0.4, 0.05, 0.9],
    ]);
    expect(bb('top')).toEqual([
      [-0.4, 0.1, 0],
      [0.4, 0.9, 0.1],
    ]);
  });

  it('is deterministic', () => {
    const a = extrudeSvg(GEAR, { size: 1, depth: 0.1, bevel: 0.01, color: WHITE });
    const b = extrudeSvg(GEAR, { size: 1, depth: 0.1, bevel: 0.01, color: WHITE });
    expect(Buffer.from(a.positions.buffer)).toEqual(Buffer.from(b.positions.buffer));
    expect(Buffer.from(a.indices.buffer)).toEqual(Buffer.from(b.indices.buffer));
  });
});

describe('latheSvg', () => {
  const VASE =
    '<svg viewBox="0 0 50 100"><path d="M0 100 H20 C30 80 10 60 15 40 Q20 20 12 0 H0 Z"/></svg>';

  it('rejects a profile that crosses the axis', () => {
    let c = '';
    try {
      latheSvg('<svg viewBox="0 0 50 100"><path d="M10 100 L-10 0"/></svg>', {
        size: 0.5,
        segments: 8,
        color: WHITE,
      });
    } catch (e) {
      c = e instanceof Ts23dError ? e.code : 'other';
    }
    expect(c).toBe('T3D_RECIPE_INVALID');
  });

  it('spins a closed half profile into a closed solid standing on z = 0', () => {
    const m = latheSvg(VASE, { size: 0.5, segments: 24, color: WHITE });
    expect(openEdges(m)).toBe(0);
    expect(volume(m)).toBeGreaterThan(0);
    const { min, max } = boundsOf(m);
    expect(min[2]).toBeCloseTo(0, 6);
    expect(max[2]).toBeCloseTo(1, 6);
    // Widest radius ≈ 0.2 m at the base (x = 20 units at 0.01 m/unit).
    expect(max[0]).toBeGreaterThan(0.19);
  });
});
