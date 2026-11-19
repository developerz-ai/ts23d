// Snow cover. Failure first: a knife crest one cell wide above the snowline must not carry a white
// line, while a broad gentle summit plateau at the same height is snowed over.

import { describe, expect, it } from 'bun:test';
import { terrainGrid } from '@developerz.ai/ts23d';
import { boxBlur, snowCover } from './snow.ts';

const OPTS = { datum: 0, snowline: 1000, northShift: 0, jitter: () => 0 };

describe('snowCover', () => {
  it('leaves a knife crest bare and covers a broad plateau', () => {
    // 8 m cells. West half: a ridge along Y with 50° flanks, its crest at 1300 m. East half: a
    // flat plateau at 1300 m.
    const g = terrainGrid({
      rect: [0, 0, 1024, 512],
      cells: 128,
      height: (x) => (x < 512 ? 1300 - 1.2 * Math.abs(x - 256) : 1300),
    });
    const cover = snowCover(g, OPTS);
    const at = (x: number, y: number): number =>
      cover[Math.round(y / 8) * g.nx + Math.round(x / 8)] ?? 0;
    expect(at(256, 256)).toBeLessThan(0.15);
    expect(at(800, 256)).toBeGreaterThan(0.9);
  });
  it('holds no snow below the snowline', () => {
    const g = terrainGrid({ rect: [0, 0, 256, 256], cells: 32, height: () => 800 });
    expect(Math.max(...snowCover(g, OPTS))).toBe(0);
  });
});

describe('boxBlur', () => {
  it('spreads one point over its (2r + 1)² box and keeps the total', () => {
    const m = new Float64Array(49);
    m[24] = 9;
    const b = boxBlur(m, 7, 7, 1);
    expect(b[24]).toBeCloseTo(1, 12);
    expect(b[16]).toBeCloseTo(1, 12);
    expect(b.reduce((s, v) => s + v, 0)).toBeCloseTo(9, 12);
  });
});
