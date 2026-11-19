import { describe, expect, it } from 'bun:test';
import { rowsSampled } from './rows-sampled.ts';
import { STRIP_H, STRIPS, stripAtV, stripRect } from './trim-sheet.ts';

describe('stripAtV', () => {
  it('classifies a triangle touching its row top by all three V values (v1 read as the next row)', () => {
    const brick = stripRect('brick');
    // One V on the shared edge is the upper row; the triangle's three are its own row.
    expect(stripAtV(brick.v1)).toBe('stone');
    expect(stripAtV(brick.v0, brick.v1, brick.v1)).toBe('brick');
    expect(stripAtV(brick.v0, brick.v0, brick.v1)).toBe('brick');
    expect(stripAtV((brick.v0 + brick.v1) / 2)).toBe('brick');
    expect(stripAtV(-0.01)).toBe('plain');
    expect(stripAtV(STRIPS.length * STRIP_H + 0.001)).toBe('custom');
    expect(stripAtV(0.9)).toBe('cell');
  });
});

describe('rowsSampled', () => {
  const row = (k: number): number => k * STRIP_H;

  it('blames no neighbour for a V on a shared edge', () => {
    // Boxes on rows 3 and 5 (edge to edge, no V inside either): row 4 has no triangle.
    const vs = [row(3), row(4), row(5), row(6)];
    expect([...rowsSampled(vs, [0, 0, 1, 2, 2, 3])].sort()).toEqual([3, 5]);
    // A lathe on row 3 (V inside it) reaching its top edge.
    expect([...rowsSampled([row(3), row(3.5), row(4)])]).toEqual([3]);
  });

  it('counts a row spanned edge to edge when it has no V strictly inside', () => {
    expect([...rowsSampled([row(7), row(8)])]).toEqual([7]);
    expect([...rowsSampled([row(7), row(8), row(9)])].sort()).toEqual([7, 8]);
  });
});
