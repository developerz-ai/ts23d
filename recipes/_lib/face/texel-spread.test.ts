import { describe, expect, it } from 'bun:test';
import { type Mesh, stripRect } from '@developerz.ai/ts23d';
import { SKIN_ROW, SKIN_STRIP } from './skin-strip.ts';
import { texelSpread } from './texel-spread.ts';

/** One 1 cm right triangle in the x-y plane, its UVs mapped by `uv` from world metres. */
function tri(uv: (x: number, y: number) => [number, number]): Mesh {
  const p = [0, 0, 0, 0.01, 0, 0, 0, 0.01, 0];
  const uvs = [0, 1, 2].flatMap((i) => uv(p[i * 3] ?? 0, p[i * 3 + 1] ?? 0));
  return {
    positions: new Float32Array(p),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array(uvs),
    colors: new Float32Array(9).fill(1),
    indices: new Uint32Array([0, 1, 2]),
  };
}

const r = stripRect(SKIN_STRIP);
/** World (x, y) → the skin strip at `ku` × and `kv` × its painted scale, mid-row. */
const at =
  (ku: number, kv: number) =>
  (x: number, y: number): [number, number] => [
    r.u0 + ((x * ku) / r.metres) * (r.u1 - r.u0),
    r.v0 + (0.1 + (y * kv) / SKIN_ROW) * (r.v1 - r.v0),
  ];

describe('texel spread', () => {
  it('fails on a squeezed triangle: 3× across the row only is a stray and a smear of 3', () => {
    const s = texelSpread(tri(at(1, 1 / 3)), [SKIN_STRIP], SKIN_ROW);
    expect(s.p95).toBeCloseTo(3, 2);
    expect(s.smear).toBeCloseTo(3, 2);
  });

  it('reads true scale as 1 and an even shrink as a stray but no smear', () => {
    const exact = texelSpread(tri(at(1, 1)), [SKIN_STRIP], SKIN_ROW);
    expect(exact.p95).toBeCloseTo(1, 3);
    expect(exact.smear).toBeCloseTo(1, 3);
    const half = texelSpread(tri(at(0.5, 0.5)), [SKIN_STRIP], SKIN_ROW);
    expect(half.p95).toBeCloseTo(2, 3);
    expect(half.smear).toBeCloseTo(1, 3);
  });

  it('measures only the strips it is given', () => {
    expect(texelSpread(tri(at(1, 1)), [], SKIN_ROW).area).toBe(0);
  });
});
