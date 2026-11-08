import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { STRIP_H, stripRow } from '../material/index.ts';
import {
  assertNoBleed,
  assertTileable,
  assertValueRange,
  type Image,
  type SheetMaps,
} from './index.ts';

const run = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code} ${e.message} fix: ${e.fix}` : `non-ts23d ${e}`;
  }
  return 'passed';
};

/** A 128×16 strip: `wrap` = one full sine period across U (tiles); otherwise a ramp (seam). */
const strip = (wrap: boolean): Image => {
  const w = 128;
  const h = 16;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = wrap ? 128 + 100 * Math.sin((2 * Math.PI * x) / w) : 20 + (x / w) * 200;
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
};

const SIZE = 1024;
const H = SIZE * STRIP_H;

/** A flat sheet: every strip one grey (albedo), roughness 0.5, metalness 0, normals straight up. */
const sheet = (grey = 128): SheetMaps & { albedo: Uint8Array; orm: Uint8Array } => {
  const n = SIZE * SIZE;
  const albedo = new Uint8Array(n * 4);
  const normal = new Uint8Array(n * 4);
  const orm = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    albedo.set([grey, grey, grey, 255], i * 4);
    normal.set([128, 128, 255, 255], i * 4);
    orm.set([255, 128, 0, 255], i * 4);
  }
  return { size: SIZE, albedo, normal, orm };
};

describe('texture assertions — failure cases first', () => {
  it('assertTileable fails a ramp (hard seam at the wrap), with the jump', () => {
    expect(run(() => assertTileable(strip(false)))).toContain(
      'left↔right jumps 198.0 vs 1.6 inside',
    );
  });

  it('assertNoBleed fails when a strip gutter holds another strip’s texels', () => {
    const s = sheet();
    const row = 3 * H; // top gutter row of strip 3
    s.albedo.fill(30, row * SIZE * 4, (row + 1) * SIZE * 4);
    expect(run(() => assertNoBleed(s))).toContain('albedo strip row 3: pixel row 48');
  });

  it('assertValueRange fails a coal-black strip, a mirror, a half-metal and a flipped normal', () => {
    const s = sheet();
    const rubber = stripRow('rubber');
    const band = (px: Uint8Array, k: number, v: number): void => {
      for (let i = rubber * H * SIZE; i < (rubber + 1) * H * SIZE; i++) px[i * 4 + k] = v;
    };
    for (const k of [0, 1, 2]) band(s.albedo, k, 8);
    band(s.orm, 1, 2);
    band(s.orm, 2, 128);
    if (s.normal) band(s.normal, 2, 60);
    const r = run(() => assertValueRange(s, { strips: ['rubber'] }));
    expect(r).toContain("'rubber' (row 20): mean albedo 8 outside 30–240");
    expect(r).toContain('a mirror');
    expect(r).toContain('half-metal');
    expect(r).toContain('point into the surface');
  });
});

describe('texture assertions — passing cases', () => {
  it('a periodic strip tiles; a clean sheet has no bleed and plausible values', () => {
    expect(assertTileable(strip(true))).toBeLessThan(3);
    expect(run(() => assertNoBleed(sheet()))).toBe('passed');
    expect(assertValueRange(sheet())).toBeGreaterThan(20);
  });
});
