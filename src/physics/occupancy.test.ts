import { describe, expect, it } from 'bun:test';
import type { CompiledAsset, Mesh, Part, Vec3 } from '../core/index.ts';
import { merge } from '../core/index.ts';
import { boxMesh } from './fixtures.ts';
import { massProperties } from './mass.ts';
import { unionCorrection } from './occupancy.ts';

const asset = (meshes: Mesh[], extra: Partial<Part> = {}): CompiledAsset => ({
  name: 'probe',
  kind: 'prop',
  lod: 0,
  budget: { triangles: [1e6, 1e6, 1e6] },
  real: null,
  checks: [],
  parts: [
    {
      name: 'merged',
      mesh: merge(meshes),
      at: [0, 0, 0],
      parent: null,
      yaw: 0,
      motion: null,
      ...extra,
    },
  ],
});
const solo = (m: Mesh) => massProperties(asset([m])).parts[0];
const yawed = (m: Mesh, a: number): Mesh => {
  const p = Float32Array.from(m.positions);
  for (let i = 0; i < p.length; i += 3) {
    const [x, y] = [p[i] ?? 0, p[i + 1] ?? 0];
    p[i] = x * Math.cos(a) - y * Math.sin(a);
    p[i + 1] = x * Math.sin(a) + y * Math.cos(a);
  }
  return { ...m, positions: p };
};
const cube = (at: Vec3, strip = 'iron', size = 1): Mesh => boxMesh([size, size, size], at, strip);

describe('union occupancy (D22: overlapping solids in one part count once)', () => {
  it('two unit cubes overlapping by half weigh 1.5 m³, not the 2 m³ a summed integral gives', () => {
    const p = massProperties(asset([cube([0, 0, 0]), cube([0.5, 0, 0])]));
    expect(p.parts[0]?.volume).toBeCloseTo(1.5, 6);
    expect(p.mass).toBeCloseTo(1.5 * 7850, 2);
    expect(p.centerOfMass[0]).toBeCloseTo(0.25, 6);
    // Union is a 1.5 × 1 × 1 box: Izz = m/12 · (1.5² + 1²).
    expect(p.inertia[2][2]).toBeCloseTo(((1.5 * 7850) / 12) * (1.5 ** 2 + 1), 1);
    expect(p.inertia[0][0]).toBeCloseTo(((1.5 * 7850) / 12) * 2, 1);
  });

  it('a cube inside a cube weighs the outer cube', () => {
    expect(solo(merge([cube([0, 0, 0]), cube([0.1, 0, 0], 'iron', 0.5)]))?.volume).toBeCloseTo(
      1,
      6,
    );
  });

  it('separate cubes stay exact (fast path, no sampling error)', () => {
    const p = massProperties(asset([cube([0, 0, 0]), cube([1, 0, 0]), cube([5, 5, 5])]));
    expect(p.parts[0]?.volume).toBeCloseTo(3, 12);
    expect(p.volumeError).toBe(0);
    expect(p.openShells).toBe(0);
    expect(p.mass).toBeCloseTo(3 * 7850, 8);
  });

  it('an inverted cube overlapping a normal one still unions', () => {
    const flipped = cube([0.5, 0, 0]);
    const ix = Uint32Array.from(flipped.indices);
    for (let i = 0; i < ix.length; i += 3)
      [ix[i + 1], ix[i + 2]] = [ix[i + 2] ?? 0, ix[i + 1] ?? 0];
    const p = solo(merge([cube([0, 0, 0]), { ...flipped, indices: ix }]));
    expect(p?.volume).toBeCloseTo(1.5, 6);
    expect(p?.invertedShells).toBe(1);
  });

  it('the overlap takes the densest material once', () => {
    const p = massProperties(asset([cube([0, 0, 0], 'oak'), cube([0.5, 0, 0], 'iron')]));
    expect(p.mass).toBeCloseTo(0.5 * 750 + 1 * 7850, 1);
  });

  it('non-grid-aligned overlap lands within the reported error bound', () => {
    // A unit cube and the same cube yawed 45°: union footprint = 2 − octagon 2(√2 − 1).
    const want = 2 - 2 * (Math.SQRT2 - 1);
    const p = solo(merge([cube([0, 0, 0]), yawed(cube([0, 0, 0]), Math.PI / 4)]));
    const err = p?.volumeError ?? 0;
    expect(err).toBeGreaterThan(0);
    expect(err).toBeLessThan(0.1);
    expect(Math.abs((p?.volume ?? 0) - want)).toBeLessThanOrEqual(err);
    expect(Math.abs((p?.volume ?? 0) - want)).toBeLessThan(0.01);
  });

  it('an open shell inside a closed one adds nothing; alone it is filled where rays fall through', () => {
    const lidless = cube([0, 0, 0], 'iron', 0.5);
    const open = { ...lidless, indices: lidless.indices.slice(0, lidless.indices.length - 6) };
    const inside = solo(merge([cube([0, 0, 0]), open]));
    expect(inside?.openShells).toBe(1);
    expect(inside?.volume).toBeCloseTo(1, 6);
    expect(solo(open)?.volume).toBeCloseTo(0.125, 6);
  });

  it('the correction is zero for one closed shell and is deterministic', () => {
    const tris = (m: Mesh) =>
      Array.from(
        { length: m.indices.length / 3 },
        (_, t) =>
          [0, 1, 2].map((k): Vec3 => {
            const i = m.indices[t * 3 + k] ?? 0;
            return [
              m.positions[i * 3] ?? 0,
              m.positions[i * 3 + 1] ?? 0,
              m.positions[i * 3 + 2] ?? 0,
            ];
          }) as unknown as readonly [Vec3, Vec3, Vec3],
      );
    expect(unionCorrection([{ tris: tris(cube([0, 0, 0])), rho: 1 }]).volume).toBe(0);
    const pair = [cube([0, 0, 0]), yawed(cube([0.2, 0.1, 0]), 0.3)].map((m) => ({
      tris: tris(m),
      rho: 1,
    }));
    expect(JSON.stringify(unionCorrection(pair))).toBe(JSON.stringify(unionCorrection(pair)));
  });
});
