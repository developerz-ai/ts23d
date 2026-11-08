import { describe, expect, it } from 'bun:test';
import { Ts23dError, type Vec2 } from '../core/index.ts';
import { assertPolygonValid, polygonFindings } from './index.ts';

const square = (s: number, ccw = true): Vec2[] => {
  const pts: Vec2[] = [
    [-s, -s],
    [s, -s],
    [s, s],
    [-s, s],
  ];
  return ccw ? pts : pts.reverse();
};

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

describe('assertPolygonValid — failure cases first', () => {
  it('fails a bow-tie (self-crossing contour)', () => {
    const bowtie: Vec2[] = [
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ];
    expect(run(() => assertPolygonValid([bowtie]))).toContain('contour 0 crosses itself');
  });

  it('fails a hole wound like its outer contour, and an outer wound clockwise', () => {
    expect(run(() => assertPolygonValid([square(2), square(1)]))).toContain(
      'contour 1 is a hole wound counter-clockwise',
    );
    expect(run(() => assertPolygonValid([square(2, false)]))).toContain(
      'contour 0 is an outer contour wound clockwise',
    );
  });

  it('fails a hole poking out of its outer contour, and a degenerate contour', () => {
    const poking: Vec2[] = [
      [1.5, -0.5],
      [1.5, 0.5],
      [3, 0.5],
      [3, -0.5],
    ];
    expect(run(() => assertPolygonValid([square(2), poking]))).toContain(
      'contour 0 edge 1 crosses contour 1',
    );
    const line: Vec2[] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(run(() => assertPolygonValid([line]))).toContain('area');
  });
});

describe('assertPolygonValid — passing cases', () => {
  it('passes an outer CCW contour with a CW hole, and the y-down convention', () => {
    expect(polygonFindings([square(2), square(1, false)])).toEqual([]);
    expect(polygonFindings([square(2, false), square(1)], { outer: 'cw' })).toEqual([]);
    expect(run(() => assertPolygonValid([square(2), square(1, false)]))).toBe('passed');
  });
});
