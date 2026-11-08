import { describe, expect, it } from 'bun:test';
import { fillHoles, iou, type Mask, taper } from './critique-mask.ts';
import { contour, shapeLanguageOf, shapeStats, simplify } from './critique-shape.ts';

const S = 128;
/** A mask from an inside test on pixel centres (y down, 0–1 units). */
const draw = (inside: (x: number, y: number) => boolean, size = S): Mask => {
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      data[y * size + x] = inside((x + 0.5) / size, (y + 0.5) / size) ? 1 : 0;
  return { size, data };
};
const inPoly =
  (pts: readonly (readonly [number, number])[]) =>
  (x: number, y: number): boolean => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i] ?? [0, 0];
      const [xj, yj] = pts[j] ?? [0, 0];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
const star = (n: number, r0: number, r1: number) =>
  inPoly(
    Array.from({ length: n * 2 }, (_, k) => {
      const a = (k * Math.PI) / n - Math.PI / 2;
      const r = k % 2 ? r1 : r0;
      return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)] as const;
    }),
  );
const square = draw((x, y) => x > 0.2 && x < 0.8 && y > 0.2 && y < 0.8);
const disk = draw((x, y) => Math.hypot(x - 0.5, y - 0.5) < 0.35);
const spiky = draw(star(6, 0.45, 0.15));
const pyramid = draw(
  inPoly([
    [0.5, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ]),
);

describe('shape language — failure case first', () => {
  it('a square is not aggressive, a disk is not stable', () => {
    expect(shapeLanguageOf([square]).shape).not.toBe('aggressive');
    expect(shapeLanguageOf([disk]).shape).not.toBe('stable');
  });
  it('classifies spikes aggressive, squares stable, rounds friendly', () => {
    expect(shapeLanguageOf([spiky]).shape).toBe('aggressive');
    expect(shapeLanguageOf([square]).shape).toBe('stable');
    expect(shapeLanguageOf([disk]).shape).toBe('friendly');
  });
  it('measures acute corners and straight runs', () => {
    expect(shapeStats(spiky).acuteShare).toBeGreaterThan(0.4);
    expect(shapeStats(square).acuteShare).toBe(0);
    expect(shapeStats(square).straightShare).toBeGreaterThan(0.95);
    expect(shapeStats(disk).straightShare).toBeLessThan(0.5);
  });
  it('taper: + for a wide base, − for top-heavy, ~0 for a column', () => {
    expect(taper(pyramid)).toBeGreaterThan(0.6);
    expect(
      taper(
        draw(
          inPoly([
            [0.1, 0.1],
            [0.9, 0.1],
            [0.5, 0.9],
          ]),
        ),
      ),
    ).toBeLessThan(-0.6);
    expect(Math.abs(taper(square))).toBeLessThan(0.05);
  });
});

describe('contour + simplify', () => {
  it('traces a closed boundary and simplifies a square to 4 corners', () => {
    const c = contour(square);
    expect(c.length).toBeGreaterThan(200);
    expect(simplify(c, 1.3)).toHaveLength(4);
  });
  it('returns nothing for an empty mask', () => {
    expect(contour(draw(() => false))).toEqual([]);
  });
});

describe('masks', () => {
  it('soft IoU drops when a mass goes missing, is 1 for identical masks', () => {
    const lost = draw((x, y) => x > 0.2 && x < 0.8 && y > 0.5 && y < 0.8);
    expect(iou(square, lost)).toBeLessThan(0.6);
    expect(iou(square, square)).toBe(1);
    expect(
      iou(
        draw(() => false),
        draw(() => false),
      ),
    ).toBe(1);
  });
  it('fills enclosed holes but not open bays', () => {
    const ring = draw((x, y) => {
      const r = Math.hypot(x - 0.5, y - 0.5);
      return r < 0.4 && r > 0.2;
    });
    const filled = fillHoles(ring);
    expect(filled.data[64 * S + 64]).toBe(1);
    const cup = draw(
      (x, y) => x > 0.2 && x < 0.8 && y > 0.2 && y < 0.8 && !(x > 0.4 && x < 0.6 && y < 0.6),
    );
    expect(fillHoles(cup).data[40 * S + 64]).toBe(0);
  });
});
