import { describe, expect, test } from 'bun:test';
import { MeshBuilder } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import type { AtlasPart } from './atlas.ts';
import { trimDetail } from './hero-detail.ts';

/** A flat quad facing +Z; atlas UV = XY; the trim UV runs ROTATED 90° (u along −y, v along x). */
function part(): AtlasPart {
  const b = new MeshBuilder();
  const v = (x: number, y: number): number =>
    b.vertex({ p: [x, y, 0], n: [0, 0, 1], uv: [x, y], color: [1, 1, 1] });
  b.quad(v(0, 0), v(1, 0), v(1, 1), v(0, 1));
  const mesh = b.build();
  const trimUv = new Float32Array(mesh.uvs.length);
  for (let i = 0; i < trimUv.length; i += 2) {
    trimUv[i] = 1 - (mesh.uvs[i + 1] ?? 0);
    trimUv[i + 1] = mesh.uvs[i] ?? 0;
  }
  return { name: 'q', mesh, trimUv };
}

/** A sheet whose every normal tilts toward +U (its own tangent). */
const sheet = (x: number): PaintedSheet => {
  const n = new Uint8Array(4 * 4 * 4);
  for (let i = 0; i < 16; i++) n.set([x, 128, 200, 255], i * 4);
  return { size: 4, albedo: n, normal: n, orm: n };
};

const S = 16;
const flat = (): Uint8Array => {
  const n = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) n.set([128, 128, 255, 255], i * 4);
  return n;
};

const base = (): Uint8Array => new Uint8Array(S * S * 4);

describe('trimDetail', () => {
  test('a flat strip leaves the field normal; parts not named are untouched', () => {
    const n = flat();
    trimDetail(part(), S, new Int32Array(S * S).fill(0), 0, {
      normal: n,
      base: base(),
      sheet: sheet(128),
    });
    expect(
      n.every((v, i) => (i % 4 === 3 ? v === 255 : Math.abs(v - (i % 4 === 2 ? 255 : 128)) <= 1)),
    ).toBe(true);
    const m = flat();
    trimDetail(part(), S, new Int32Array(S * S).fill(1), 0, {
      normal: m,
      base: base(),
      sheet: sheet(255),
    });
    expect(m).toEqual(flat());
  });

  test("the strip's tilt follows the trim frame into the atlas frame", () => {
    const n = flat();
    trimDetail(part(), S, new Int32Array(S * S).fill(0), 0, {
      normal: n,
      base: base(),
      sheet: sheet(230),
    });
    const i = (8 * S + 8) * 4;
    // Trim +U runs along world −y; the atlas B (green) runs toward decreasing v = −y: green rises.
    expect(n[i + 1] ?? 0).toBeGreaterThan(150);
    expect(Math.abs((n[i] ?? 0) - 128)).toBeLessThanOrEqual(2);
  });

  test('a baked source colour replaces the base where baked, × the strip albedo', () => {
    const b = base();
    const color = new Float32Array(S * S * 3).fill(-1);
    color.set([1, 0, 0], (8 * S + 8) * 3);
    // No sheet: a white strip, pure red; a 230 strip: red × 230.
    trimDetail(part(), S, new Int32Array(S * S).fill(0), 0, { normal: flat(), base: b, color });
    expect([...b.subarray((8 * S + 8) * 4, (8 * S + 8) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect(b[(2 * S + 2) * 4 + 3]).toBe(0);
    const c = base();
    trimDetail(part(), S, new Int32Array(S * S).fill(0), 0, {
      normal: flat(),
      base: c,
      color,
      sheet: sheet(230),
    });
    expect(c[(8 * S + 8) * 4]).toBe(230);
  });
});
