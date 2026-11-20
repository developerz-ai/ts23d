import { describe, expect, it } from 'bun:test';
import { compile, dmath, type Mesh } from '../core/index.ts';
import { cylinder } from '../primitives/index.ts';
import { buildAtlas } from './atlas.ts';
import { cart } from './fixtures.ts';
import { lscmCharts, STRETCH_MAX } from './lscm.ts';
import { overlaps, stretchL2, type V3 } from './lscm-gate.ts';

/** An open tube, `seg` facets round, `rows` high: developable, so LSCM can unroll it exactly. */
function tube(r: number, len: number, seg: number, rows: number): Mesh {
  const P: number[] = [];
  const I: number[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 1.4;
      P.push(dmath.cos(a) * r, dmath.sin(a) * r, (j / rows) * len);
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + 1;
      const c = a + seg + 1;
      const d = c + 1;
      I.push(a, b, d, a, d, c);
    }
  const n = P.length / 3;
  return {
    positions: new Float32Array(P),
    normals: new Float32Array(n * 3).fill(0),
    uvs: new Float32Array(n * 2),
    colors: new Float32Array(n * 3).fill(1),
    indices: new Uint32Array(I),
  };
}

const flat: V3[] = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
];

describe('LSCM gate measures', () => {
  it('stretch: an isometry (any uniform scale) reads 1; a 3:1 squash fails the gate', () => {
    expect(
      stretchL2(
        [flat],
        [
          [
            [0, 0],
            [2, 0],
            [0, 2],
          ],
        ],
      ),
    ).toBeCloseTo(1, 6);
    const squashed = stretchL2(
      [flat],
      [
        [
          [0, 0],
          [3, 0],
          [0, 1],
        ],
      ],
    );
    expect(squashed).toBeGreaterThan(STRETCH_MAX);
  });

  it('overlap: two triangles stacked on each other overlap; two side by side do not', () => {
    const a: [number, number][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    const b: [number, number][] = [
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(overlaps([a, b])).toBe(false);
    expect(overlaps([a, a])).toBe(true);
  });
});

describe('lscmCharts', () => {
  it('a 250° tube unrolls flat: stretch < 1.05 per chart, all charts pass', () => {
    const charts = lscmCharts(tube(0.3, 1, 32, 12), { cone: 89, ridge: 30 });
    expect(charts.length).toBeLessThanOrEqual(3);
    for (const c of charts) {
      expect(c.stretch).toBeLessThan(1.05);
      expect(c.ok).toBe(true);
    }
  });

  it('a closed cylinder with caps: every triangle in exactly one chart, all charts gated', () => {
    const m = cylinder({ radius: 0.2, length: 0.8, segments: 24, color: [1, 1, 1] });
    const charts = lscmCharts(m);
    const seen = new Uint8Array(m.indices.length / 3);
    for (const c of charts) for (const t of c.tris) seen[t] = (seen[t] ?? 0) + 1;
    expect([...seen].every((n) => n === 1)).toBe(true);
    for (const c of charts) expect(c.ok).toBe(true);
    expect(Math.max(...charts.map((c) => c.stretch))).toBeLessThan(1.05);
  });

  it('UVs in metres at true area, deterministic', () => {
    const m = tube(0.3, 1, 32, 12);
    const a = lscmCharts(m, { cone: 89, ridge: 30 });
    const b = lscmCharts(m, { cone: 89, ridge: 30 });
    expect(a.map((c) => [...c.uv])).toEqual(b.map((c) => [...c.uv]));
    // The tube's flat area is 1.4π·r·len.
    let area = 0;
    for (const c of a)
      for (const t of c.tris) {
        const p = [0, 1, 2].map((k) => {
          const s = c.slot.get(m.indices[t * 3 + k] ?? 0) ?? 0;
          return [c.uv[2 * s] ?? 0, c.uv[2 * s + 1] ?? 0];
        });
        const [p0, p1, p2] = p as [number[], number[], number[]];
        area +=
          Math.abs(
            ((p1[0] ?? 0) - (p0[0] ?? 0)) * ((p2[1] ?? 0) - (p0[1] ?? 0)) -
              ((p2[0] ?? 0) - (p0[0] ?? 0)) * ((p1[1] ?? 0) - (p0[1] ?? 0)),
          ) / 2;
      }
    expect(area).toBeCloseTo(1.4 * Math.PI * 0.3 * 1, 1);
  });
});

describe('buildAtlas unwraps', () => {
  const asset = compile(cart, { lod: 0 });
  const uvs = (u: 'lscm' | 'box') =>
    [...buildAtlas(asset, 512, 2, u).parts.values()].map((p) => [...p.mesh.uvs]);

  it('box fallback and LSCM are both deterministic, UVs inside 0..1', () => {
    for (const u of ['box', 'lscm'] as const) {
      const a = uvs(u);
      expect(uvs(u)).toEqual(a);
      for (const p of a) for (const v of p) expect(v >= 0 && v <= 1).toBe(true);
    }
  });

  it('LSCM merges facets the box projection splits: fewer charts on a curved cart', () => {
    expect(buildAtlas(asset, 512, 2, 'lscm').charts).toBeLessThan(
      buildAtlas(asset, 512, 2, 'box').charts,
    );
  });
});
