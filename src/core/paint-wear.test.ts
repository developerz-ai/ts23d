// Wear on a paint slot: without `wear` a team-painted part can only darken its slot (bright wear
// is refused, hue-shifted wear is flattened onto the slot hue and recoloured by every livery);
// with `paint: { team: { colour, wear: true } }` bare steel, primer, rust and dust keep their own
// colour in the default, in every livery, and the paint around them still recolours.

import { describe, expect, it } from 'bun:test';
import { type AssetDefinition, compile, defineAsset } from './asset.ts';
import type { Mesh } from './mesh.ts';
import { isBare, settleWear, splitWear } from './paint-wear.ts';
import type { Vec3 } from './vec.ts';

const RED: Vec3 = [0.5, 0.04, 0.03];
const BLUE: Vec3 = [0.03, 0.08, 0.5];
const STEEL: Vec3 = [0.3, 0.3, 0.29];
const DUST: Vec3 = [0.62, 0.55, 0.42];

/** n × n vertex grid on z = 0, 1 m cells; `colour(x, y)` per vertex. */
function grid(n: number, colour: (x: number, y: number) => Vec3): Mesh {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      positions.push(x, y, 0);
      normals.push(0, 0, 1);
      uvs.push(0.5, 0.5);
      colors.push(...colour(x, y));
    }
  const indices: number[] = [];
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const a = y * n + x;
      indices.push(a, a + 1, a + n + 1, a, a + n + 1, a + n);
    }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from(indices),
  };
}

/** Red paint, half shaded darker, with a 2 × 2-vertex steel chip and a 2 × 2 dust patch. */
const worn = (): Mesh =>
  grid(6, (x, y) => {
    if (x <= 1 && y <= 1) return STEEL;
    if (x >= 4 && y >= 4) return DUST;
    const k = y < 3 ? 1 : 0.6;
    return [RED[0] * k, RED[1] * k, RED[2] * k];
  });

const def = (slot: NonNullable<AssetDefinition['paint']>): AssetDefinition => ({
  name: 'worn_plate',
  kind: 'prop',
  budget: { triangles: [999, 999, 999] },
  paint: slot,
  variants: { blue: { team: BLUE } },
  build(ctx) {
    ctx.part('plate', worn(), { paint: 'team' });
  },
});

const colourAt = (m: Mesh, x: number, y: number): Vec3 => {
  for (let v = 0; v < m.positions.length / 3; v++)
    if (m.positions[v * 3] === x && m.positions[v * 3 + 1] === y)
      return [m.colors[v * 3] ?? 0, m.colors[v * 3 + 1] ?? 0, m.colors[v * 3 + 2] ?? 0];
  throw new Error(`no vertex at ${x}, ${y}`);
};
const near = (a: Vec3, b: Vec3): void => {
  for (let i = 0; i < 3; i++) expect(a[i] ?? 0).toBeCloseTo(b[i] ?? 0, 5);
};

describe('wear on a paint slot', () => {
  it('without wear: bright wear on a team part is refused (the slot can only darken)', () => {
    expect(() => compile(defineAsset(def({ team: RED })))).toThrow(/brighter than paint slot/);
  });

  it('classifies the slot hue as paint and steel, primer, dust, rust, mud as bare', () => {
    expect(isBare([RED[0] * 0.4, RED[1] * 0.4, RED[2] * 0.4], RED)).toBe(false);
    // 30 % dark grime and a 60 % sun-fade keep the red hue: paint, so a livery recolours them.
    expect(isBare([0.377, 0.046, 0.03], RED)).toBe(false);
    expect(isBare([0.346, 0.072, 0.068], RED)).toBe(false);
    expect(isBare(STEEL, RED)).toBe(true);
    expect(isBare([0.42, 0.4, 0.36], RED)).toBe(true);
    expect(isBare(DUST, RED)).toBe(true);
    expect(isBare([0.2, 0.065, 0.02], RED)).toBe(true);
    expect(isBare([0.09, 0.06, 0.03], RED)).toBe(true);
  });

  it('refuses wear on a lacquered slot (renders would lacquer the bare chips)', () => {
    const slot = { team: { colour: RED, wear: true, clearcoat: 1 } };
    expect(() => compile(defineAsset(def(slot)))).toThrow(/both wear and a lacquer/);
  });

  it('refuses a near-grey wear slot (wear could not be told from paint)', () => {
    const slot = { team: { colour: [0.8, 0.8, 0.78] as Vec3, wear: true } };
    expect(() => compile(defineAsset(def(slot)))).toThrow(/near-grey/);
  });

  it('keeps the wear in the default look and in a livery; the paint recolours', () => {
    const slot = { team: { colour: RED, wear: true } };
    const plain = compile(defineAsset(def(slot)));
    const blue = compile(defineAsset(def(slot)), { variant: 'blue' });
    const m = plain.parts[0]?.mesh as Mesh;
    const b = blue.parts[0]?.mesh as Mesh;
    expect(plain.paintSet?.wear).toEqual(['team']);
    near(colourAt(m, 0, 0), STEEL);
    near(colourAt(b, 0, 0), STEEL);
    near(colourAt(b, 5, 5), DUST);
    near(colourAt(m, 3, 1), RED);
    near(colourAt(b, 3, 1), BLUE);
    near(colourAt(b, 3, 4), [BLUE[0] * 0.6, BLUE[1] * 0.6, BLUE[2] * 0.6]);
  });

  it('cuts a chip inside its triangles: a lone bare vertex keeps an irregular chip', () => {
    // One steel vertex in a red 5 × 5 plate: every triangle round it has one bare vertex, so a
    // per-triangle split loses the chip (or, with two, makes a lattice-aligned sawtooth).
    const one = grid(5, (x, y) => (x === 2 && y === 2 ? STEEL : RED));
    const s = settleWear(one, RED);
    const { bare } = splitWear(s, RED);
    expect(bare).toBeTruthy();
    const r: number[] = [];
    for (let v = 0; v < (bare?.positions.length ?? 0) / 3; v++) {
      const dx = (bare?.positions[v * 3] ?? 0) - 2;
      const dy = (bare?.positions[v * 3 + 1] ?? 0) - 2;
      // Rim points on the axis edges (length 1); the diagonals (√2) are cut too.
      const d = Math.sqrt(dx * dx + dy * dy) / (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      expect(d).toBeLessThan(1);
      if (d > 0) r.push(d);
    }
    // Its rim is cut at varied fractions along the edges, not at one fixed fraction of the lattice.
    expect(r.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...r) - Math.min(...r)).toBeGreaterThan(0.1);
    // No triangle mixes paint and bare vertices.
    for (let t = 0; t < s.indices.length / 3; t++) {
      const n = [0, 1, 2].filter((k) => {
        const v = s.indices[t * 3 + k] ?? 0;
        return isBare(
          [s.colors[v * 3] ?? 0, s.colors[v * 3 + 1] ?? 0, s.colors[v * 3 + 2] ?? 0],
          RED,
        );
      }).length;
      expect(n === 0 || n === 3).toBe(true);
    }
  });

  it('cuts a shared edge at the same point from both sides (no T-junctions)', () => {
    const s = settleWear(worn(), RED);
    const key = (v: number): string =>
      `${(s.positions[v * 3] ?? 0).toFixed(5)},${(s.positions[v * 3 + 1] ?? 0).toFixed(5)}`;
    const edges = new Map<string, number>();
    for (let t = 0; t < s.indices.length / 3; t++)
      for (let k = 0; k < 3; k++) {
        const a = key(s.indices[t * 3 + k] ?? 0);
        const b = key(s.indices[t * 3 + ((k + 1) % 3)] ?? 0);
        const e = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(e, (edges.get(e) ?? 0) + 1);
      }
    const onRim = (p: string): boolean =>
      p.split(',').some((c) => Number(c) === 0 || Number(c) === 5);
    for (const [e, n] of edges) {
      const [a = '', b = ''] = e.split('|');
      // An edge used once is the plate's own border; every inner edge is shared.
      if (n === 1) expect(onRim(a) && onRim(b)).toBe(true);
    }
  });

  it('settles the border: no paint vertex shared with wear, no livery colour inside it', () => {
    const s = settleWear(worn(), RED);
    expect(s.indices.length).toBeGreaterThan(worn().indices.length);
    expect(s.positions.length).toBeGreaterThan(worn().positions.length);
    const { paint, bare } = splitWear(s, RED);
    expect(paint && bare).toBeTruthy();
    for (let v = 0; v < (bare?.colors.length ?? 0) / 3; v++) {
      const c: Vec3 = [bare?.colors[v * 3] ?? 0, bare?.colors[v * 3 + 1] ?? 0, 0];
      // Every bare-side vertex is steel or dust (or a mean of them), never the red paint.
      expect(c[1] / c[0]).toBeGreaterThan(0.5);
    }
    // Stable: settling twice cuts the same triangles.
    const again = splitWear(settleWear(s, RED), RED);
    expect(again.bare?.indices.length).toBe(bare?.indices.length);
    expect(again.paint?.indices.length).toBe(paint?.indices.length);
  });

  it('blends the skin of a cut point by joint at its fraction (no kink along a chip border)', () => {
    // Left column on joint 1, right on joint 2, the middle split 50/50; a steel chip in the middle.
    const plate = grid(3, (x, y) => (x === 1 && y === 1 ? STEEL : RED));
    const joints = new Uint16Array(9 * 4);
    const weights = new Float32Array(9 * 4);
    for (let v = 0; v < 9; v++) {
      const x = v % 3;
      joints.set(x === 2 ? [2, 0, 0, 0] : [1, 2, 0, 0], v * 4);
      weights.set(x === 0 ? [1, 0, 0, 0] : x === 1 ? [0.5, 0.5, 0, 0] : [1, 0, 0, 0], v * 4);
    }
    const s = settleWear({ ...plate, joints, weights }, RED);
    expect(s.positions.length / 3).toBeGreaterThan(9);
    for (let v = 9; v < s.positions.length / 3; v++) {
      const x = s.positions[v * 3] ?? 0;
      // The blend a linear skin gives along the edge: joint 2's share grows with x.
      const want2 = x <= 1 ? 0.5 * x : 0.5 + 0.5 * (x - 1);
      let w1 = 0;
      let w2 = 0;
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const w = s.weights?.[v * 4 + k] ?? 0;
        const j = s.joints?.[v * 4 + k] ?? 0;
        sum += w;
        if (w > 0 && j === 1) w1 += w;
        if (w > 0 && j === 2) w2 += w;
      }
      expect(sum).toBeCloseTo(1, 5);
      expect(w2).toBeCloseTo(want2, 5);
      expect(w1).toBeCloseTo(1 - want2, 5);
    }
  });

  it('a slot without wear compiles to the same colours as before', () => {
    const dark = (): AssetDefinition => ({
      ...def({ team: RED }),
      build(ctx) {
        ctx.part(
          'plate',
          grid(3, () => [0.25, 0.02, 0.015]),
          { paint: 'team' },
        );
      },
    });
    const m = compile(defineAsset(dark())).parts[0]?.mesh as Mesh;
    expect(m.colors).toEqual(grid(3, () => [0.25, 0.02, 0.015]).colors);
  });

  it('refuses a wear flag that is not a boolean', () => {
    const slot = { team: { colour: RED, wear: 'yes' as unknown as boolean } };
    expect(() => compile(defineAsset(def(slot)))).toThrow(/paint.team.wear is "yes"/);
  });
});
