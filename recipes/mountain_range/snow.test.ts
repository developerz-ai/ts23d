// Snow cover. Failure first: a knife crest one cell wide above the snowline must not carry a white
// line, while a broad gentle summit plateau at the same height is snowed over.

import { describe, expect, it } from 'bun:test';
import { dmath, terrainGrid } from '@developerz.ai/ts23d';
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
  it('fills a small bare knob inside a snowfield only when `fill` asks (no dark blob)', () => {
    // A plateau at 1300 m with a steep 60° knob 90 m across in its middle: too steep to hold
    // snow, so it is a bare hole in the field unless holes are filled.
    const g = terrainGrid({
      rect: [0, 0, 512, 512],
      cells: 64,
      height: (x, y) => 1300 + Math.max(0, 75 - 1.7 * dmath.hypot(x - 256, y - 256)),
    });
    const at = (c: Float64Array): number => c[32 * g.nx + 32] ?? 0;
    expect(at(snowCover(g, OPTS))).toBeLessThan(0.5);
    expect(at(snowCover(g, { ...OPTS, fill: 60 }))).toBeGreaterThan(0.9);
    // No field, nothing to close: no snow appears below the snowline.
    const low = terrainGrid({ rect: [0, 0, 256, 256], cells: 32, height: () => 800 });
    expect(Math.max(...snowCover(low, { ...OPTS, fill: 60 }))).toBe(0);
  });
  it('also closes a narrow bare bay cut into the field from its edge (the outer line moves)', () => {
    // A field above the line on y < 256 with a bare bay 48 m wide reaching 106 m into it from the
    // edge. A closing cannot tell a bay from a hole: with `fill` its inner part snows over, while
    // the open ground outside the field stays bare.
    const g = terrainGrid({
      rect: [0, 0, 512, 512],
      cells: 64,
      height: (x, y) => (y < 256 && !(Math.abs(x - 256) < 24 && y > 150) ? 1300 : 800),
    });
    const at = (c: Float64Array, x: number, y: number): number =>
      c[Math.round(y / 8) * g.nx + Math.round(x / 8)] ?? 0;
    expect(at(snowCover(g, OPTS), 256, 180)).toBe(0);
    const filled = snowCover(g, { ...OPTS, fill: 60 });
    expect(at(filled, 256, 180)).toBeGreaterThan(0.9);
    expect(at(filled, 100, 400)).toBe(0);
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
