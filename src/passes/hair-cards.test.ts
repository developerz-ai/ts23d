import { describe, expect, test } from 'bun:test';
import { createRng, type Mesh, MeshBuilder, type Vec3 } from '../core/index.ts';
import type { UvRect } from '../material/index.ts';
import { type CardZone, hairCards } from './hair-cards.ts';
import { hairFlow } from './hair-flow.ts';
import { clumpOf } from './hair-roots.ts';

const R = 0.1;
const LEN = 1;
/** Open cylinder along +X, radius R (shared vertices, outward normals). */
function cylinder(rings = 30, around = 24): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i <= rings; i++)
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const n: Vec3 = [0, Math.cos(a), Math.sin(a)];
      b.vertex({
        p: [(i / rings) * LEN, R * n[1], R * n[2]],
        n,
        uv: [0, 0],
        color: [0.5, 0.4, 0.3],
      });
    }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < around; j++) {
      const v = (ii: number, jj: number): number => ii * around + (jj % around);
      b.quad(v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
    }
  return b.build();
}
/** Infinite-cylinder SDF (the mesh is a polygon inside it; close enough for 24 sides). */
const field = (p: Vec3): number => Math.hypot(p[1], p[2]) - R;

const CELL: UvRect = { u0: 0.1, u1: 0.2, v0: 0.5, v1: 0.51, metres: 1 };
const zone = (o: Partial<CardZone> = {}): CardZone => ({
  name: 'coat',
  density: () => 400,
  length: 0.05,
  width: 0.012,
  cells: [CELL],
  ...o,
});
const surface = cylinder();
const flow = hairFlow(surface, () => [1, 0, 0]);
const run = (o: Partial<Parameters<typeof hairCards>[0]> = {}) =>
  hairCards({ surface, flow, zones: [zone()], rng: createRng(3), field, ...o });

const at = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];

describe('hairCards', () => {
  test('fails: a zone without atlas cells, a flow for another mesh, too many cards', () => {
    expect(() => run({ zones: [zone({ cells: [] })] })).toThrow(/0 atlas cells/);
    expect(() => run({ flow: new Float32Array(9) })).toThrow(/flow has 3 directions/);
    expect(() => run({ maxCards: 10 })).toThrow(/cap 10/);
  });

  test('fails if a root is outside the surface: every root is buried by `sink`', () => {
    const { roots } = run({ zones: [zone({ sink: 0.004 })] });
    expect(roots.length).toBeGreaterThan(0);
    for (const r of roots) expect(field(r)).toBeLessThan(-0.002);
  });

  test('count follows density × area; Poisson spacing holds', () => {
    const area = 2 * Math.PI * R * LEN * Math.cos(Math.PI / 24);
    const { roots, counts } = run();
    expect(counts['coat']).toBe(roots.length);
    expect(roots.length).toBeGreaterThan(area * 400 * 0.6);
    expect(roots.length).toBeLessThan(area * 400 * 1.4);
    const rmin = 0.62 / Math.sqrt(400) - 0.005;
    for (let i = 0; i < roots.length; i += 7)
      for (let j = i + 1; j < roots.length; j++) {
        const a = roots[i] ?? [0, 0, 0];
        const b = roots[j] ?? [0, 0, 0];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeGreaterThan(rmin);
      }
    expect(run({ zones: [zone({ density: () => 0 })] }).roots).toHaveLength(0);
  });

  test('cards run along the flow, U grows root → tip, and stay out of the skin', () => {
    const segs = 3;
    const { mesh, roots } = run({ segments: segs });
    const per = 2 * (segs + 1);
    expect(mesh.positions.length / 3).toBe(roots.length * per);
    for (let c = 0; c < roots.length; c++) {
      const v0 = c * per;
      const root = at(mesh, v0);
      const tip = at(mesh, v0 + per - 2);
      expect(tip[0] - root[0]).toBeGreaterThan(0.02);
      for (let k = 1; k <= segs; k++) {
        expect(mesh.uvs[(v0 + 2 * k) * 2] ?? 0).toBeGreaterThan(
          mesh.uvs[(v0 + 2 * k - 2) * 2] ?? 0,
        );
        const mid = at(mesh, v0 + 2 * k);
        const mid2 = at(mesh, v0 + 2 * k + 1);
        expect(
          field([(mid[0] + mid2[0]) / 2, (mid[1] + mid2[1]) / 2, (mid[2] + mid2[2]) / 2]),
        ).toBeGreaterThan(-1e-3);
      }
      const u0 = mesh.uvs[v0 * 2] ?? 0;
      expect(u0).toBeCloseTo(CELL.u0, 6);
    }
  });

  test('vertex normals agree with the winding (QA normals-winding)', () => {
    const { mesh } = run();
    let bad = 0;
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => at(mesh, mesh.indices[t + k] ?? 0)) as [
        Vec3,
        Vec3,
        Vec3,
      ];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      const i = mesh.indices[t] ?? 0;
      const d =
        (n[0] ?? 0) * (mesh.normals[i * 3] ?? 0) +
        (n[1] ?? 0) * (mesh.normals[i * 3 + 1] ?? 0) +
        (n[2] ?? 0) * (mesh.normals[i * 3 + 2] ?? 0);
      if (d < 0) bad++;
    }
    expect(bad).toBe(0);
  });

  test('deterministic per seed', () => {
    const a = run().mesh.positions;
    const b = run().mesh.positions;
    const c = run({ rng: createRng(4) }).mesh.positions;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(Buffer.from(a.buffer).equals(Buffer.from(c.buffer))).toBe(false);
  });

  test('fails without collide: a solid in the way is crossed; with collide no card point is in it', () => {
    // A slab just above the top of the cylinder that long, lifted cards would pass through.
    const slab = (p: Vec3): number => Math.max(R + 0.01 - p[2], p[2] - (R + 0.03));
    const long = [zone({ length: 0.12, lift: 0.9, bend: 0.2 })];
    const inside = (m: Mesh, skip: number): number => {
      let n = 0;
      for (let i = 0; i < m.positions.length / 3; i++)
        if (i % 8 > 1 && i % 8 !== skip && slab(at(m, i)) < -1e-3) n++;
      return n;
    };
    expect(inside(run({ zones: long }).mesh, -1)).toBeGreaterThan(0);
    const kept = run({ zones: long, collide: slab }).mesh;
    let bad = 0;
    for (let i = 0; i < kept.positions.length / 3; i++) {
      // Centre line (mean of each row's two vertices), past the root row.
      if (i % 2 === 1 || i % 8 === 0) continue;
      const a = at(kept, i);
      const b = at(kept, i + 1);
      if (slab([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]) < -1e-3) bad++;
    }
    expect(bad).toBe(0);
  });

  test('clumped cards share tips: tips gather closer than their roots', () => {
    const spread = (clump: number): number => {
      const m = run({
        zones: [zone({ clump, length: 0.08, width: 0.02, density: () => 900 })],
      }).mesh;
      const tips: Vec3[] = [];
      for (let c = 0; c < m.positions.length / 3 / 8; c++) {
        const a = at(m, c * 8 + 6);
        const b = at(m, c * 8 + 7);
        tips.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
      }
      // Mean distance from each tip to its nearest other tip.
      let sum = 0;
      for (const p of tips) {
        let best = Infinity;
        for (const q of tips)
          if (q !== p) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
        sum += best;
      }
      return sum / tips.length;
    };
    expect(spread(5)).toBeLessThan(spread(1) * 0.6);
  });

  test('fails if a clump bridges two legs: no root joins a leader beyond `reach`', () => {
    // Two far-apart groups (two legs) with a huge Poisson radius: only `reach` keeps them apart.
    const list = [0, 1, 2, 3, 4, 5].map((i) => ({
      p: [i < 3 ? 0 : 0.5, i * 0.001, 0] as Vec3,
      t: 0,
      b1: 0,
      b2: 0,
      r: 1,
    }));
    expect([...clumpOf(list, 6)].some((l, i) => l === 0 && i >= 3)).toBe(true);
    const lead = clumpOf(list, 6, 0.1);
    for (let i = 3; i < 6; i++) expect(lead[i]).toBe(i);
  });
});
