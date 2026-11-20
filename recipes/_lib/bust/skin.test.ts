import { describe, expect, it } from 'bun:test';
import { createRng, dmath, type Field, type Mesh, type Vec3 } from '@developerz.ai/ts23d';
import { skinMesh } from './skin.ts';

const TONE = {
  skin: [0.66, 0.31, 0.16] as Vec3,
  warm: [0.75, 0.4, 0.22] as Vec3,
  cool: [0.4, 0.25, 0.2] as Vec3,
  cavity: [0.15, 0.04, 0.02] as Vec3,
};
const R = 0.1;
const CELL = 0.002;

/** A faceted sphere (600 tangent planes, ≈ 1 cm facets) sampled on a 2 mm lattice and blended
 *  trilinearly: the creases of a mesh-field sculpt built from a base mesh's triangles. */
const DIRS: Vec3[] = Array.from({ length: 600 }, (_, i) => {
  const z = 1 - (2 * (i + 0.5)) / 600;
  const r = Math.sqrt(1 - z * z);
  const a = i * Math.PI * (3 - Math.sqrt(5));
  return [r * dmath.cos(a), r * dmath.sin(a), z];
});
const facets = (x: number, y: number, z: number): number => {
  let d = -1;
  for (const n of DIRS) d = Math.max(d, n[0] * x + n[1] * y + n[2] * z - R);
  return d;
};
const memo = new Map<string, number>();
const lattice: Field = (p) => {
  const g = (i: number, j: number, k: number): number => {
    const key = `${i},${j},${k}`;
    let v = memo.get(key);
    if (v === undefined) {
      v = facets(i * CELL, j * CELL, k * CELL);
      memo.set(key, v);
    }
    return v;
  };
  const [x, y, z] = [p[0] / CELL, p[1] / CELL, p[2] / CELL];
  const [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [u, v, w] = [x - i, y - j, z - k];
  let out = 0;
  for (let c = 0; c < 8; c++) {
    const a = c & 1;
    const b = (c >> 1) & 1;
    const d = (c >> 2) & 1;
    out += g(i + a, j + b, k + d) * (a ? u : 1 - u) * (b ? v : 1 - v) * (d ? w : 1 - w);
  }
  return out;
};
const box: [Vec3, Vec3] = [
  [-0.12, -0.12, -0.12],
  [0.12, 0.12, 0.12],
];
const lum = (m: Mesh, i: number): number =>
  0.2126 * (m.colors[i * 3] ?? 0) +
  0.7152 * (m.colors[i * 3 + 1] ?? 0) +
  0.0722 * (m.colors[i * 3 + 2] ?? 0);

/** Mean |Δ luminance| across mesh edges: paint noise between neighbouring vertices. */
function edgeNoise(m: Mesh): number {
  let sum = 0;
  let n = 0;
  for (let t = 0; t < m.indices.length; t += 3)
    for (let e = 0; e < 3; e++) {
      sum += Math.abs(lum(m, m.indices[t + e] ?? 0) - lum(m, m.indices[t + ((e + 1) % 3)] ?? 0));
      n++;
    }
  return sum / n;
}

describe('bust skin painter', () => {
  it('paints a faceted mesh-field sphere without curvature streaks along its creases (D58)', () => {
    const m = skinMesh([{ field: lattice, bounds: box }], 0.006, {
      rng: createRng(3),
      tone: TONE,
      stencil: 0.004,
    });
    // A 4 mm Laplacian across the facet creases painted ≈ 0.027 per edge (streaks); the 10 mm
    // one leaves ≈ 0.007: the warm-top/cool-under gradient and the mottle.
    expect(edgeNoise(m)).toBeLessThan(0.01);
  });
  it('paints the scalp inside a hairline the hair colour, skin outside it (D57)', () => {
    const hair: Vec3 = [0.04, 0.02, 0.01];
    const m = skinMesh([{ field: lattice, bounds: box }], 0.008, {
      rng: createRng(3),
      tone: TONE,
      scalp: [{ line: (p) => 0.03 - p[2], color: hair }],
    });
    for (let i = 0; i * 3 < m.positions.length; i++) {
      const z = m.positions[i * 3 + 2] ?? 0;
      if (z > 0.04) expect(lum(m, i)).toBeLessThan(0.06);
      if (z < 0.02) expect(lum(m, i)).toBeGreaterThan(0.1);
    }
  });
});
