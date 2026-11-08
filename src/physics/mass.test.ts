import { describe, expect, it } from 'bun:test';
import type { CompiledAsset, Mesh, Part } from '../core/index.ts';
import { boxMesh, cylinderMesh } from './fixtures.ts';
import { massProperties } from './mass.ts';

const part = (name: string, mesh: Mesh, extra: Partial<Part> = {}): Part => ({
  name,
  mesh,
  at: [0, 0, 0],
  parent: null,
  yaw: 0,
  motion: null,
  ...extra,
});
const asset = (parts: Part[], extra: Partial<CompiledAsset> = {}): CompiledAsset => ({
  name: 'probe',
  kind: 'prop',
  lod: 0,
  budget: { triangles: [1e6, 1e6, 1e6] },
  real: null,
  checks: [],
  parts,
  ...extra,
});
const dropFace = (m: Mesh): Mesh => ({ ...m, indices: m.indices.slice(0, m.indices.length - 6) });
const flip = (m: Mesh): Mesh => {
  const indices = Uint32Array.from(m.indices);
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2] ?? 0, indices[i + 1] ?? 0];
  return { ...m, indices };
};

describe('massProperties', () => {
  it('flags an open shell and fills it (hull only where rays fall through the hole), not a meaningless signed sum', () => {
    const p = massProperties(
      asset([part('lid_missing', dropFace(boxMesh([1, 1, 1], [5, 0, 0], 'iron')))]),
    );
    expect(p.openShells).toBe(1);
    expect(p.mass).toBeCloseTo(7850, 3);
  });

  it('a unit iron cube weighs 7850 kg with its centre where it sits', () => {
    const p = massProperties(asset([part('cube', boxMesh([1, 1, 1], [0, 0, 0.5], 'iron'))]));
    expect(p.openShells).toBe(0);
    expect(p.parts[0]?.volume).toBeCloseTo(1, 6);
    expect(p.parts[0]?.strip).toBe('iron');
    expect(p.mass).toBeCloseTo(7850, 3);
    expect(p.centerOfMass[2]).toBeCloseTo(0.5, 6);
  });

  it('box inertia matches m/12·(b² + c²) on each axis', () => {
    const [a, b, c] = [2, 1, 0.5];
    const p = massProperties(asset([part('slab', boxMesh([a, b, c], [1, 2, 3], 'oak'))]));
    const m = 750 * a * b * c;
    expect(p.mass).toBeCloseTo(m, 3);
    expect(p.inertia[0][0]).toBeCloseTo((m / 12) * (b * b + c * c), 3);
    expect(p.inertia[1][1]).toBeCloseTo((m / 12) * (a * a + c * c), 3);
    expect(p.inertia[2][2]).toBeCloseTo((m / 12) * (a * a + b * b), 3);
    expect(Math.abs(p.inertia[0][1])).toBeLessThan(1e-6);
    expect(p.inertiaDiagonal[0]).toBeCloseTo((m / 12) * (a * a + b * b), 3);
  });

  it('an inside-out shell still counts positive mass', () => {
    const p = massProperties(asset([part('inv', flip(boxMesh([1, 1, 1], [0, 0, 0], 'iron')))]));
    expect(p.mass).toBeCloseTo(7850, 3);
    expect(p.parts[0]?.invertedShells).toBe(1);
  });

  it('a hollow shell weighs area × wall × density, capped at solid', () => {
    const hollow = massProperties(asset([part('tank', boxMesh([2, 2, 2], [0, 0, 0], 'iron'))]), {
      shell: 0.01,
    });
    expect(hollow.mass).toBeCloseTo(24 * 0.01 * 7850, 3);
    const thick = massProperties(
      asset([part('tank', boxMesh([2, 2, 2], [0, 0, 0], 'iron'), { shell: 5 })]),
    );
    expect(thick.mass).toBeCloseTo(8 * 7850, 3);
  });

  it('density overrides: per strip on the asset, per part on the part', () => {
    const m = boxMesh([1, 1, 1], [0, 0, 0], 'plain');
    expect(massProperties(asset([part('a', m)])).mass).toBeCloseTo(1000, 3);
    expect(massProperties(asset([part('a', m)]), { density: { plain: 7850 } }).mass).toBeCloseTo(
      7850,
      3,
    );
    expect(massProperties(asset([part('a', m, { density: 2400 })])).mass).toBeCloseTo(2400, 3);
  });

  it('a mass override keeps the distribution and reports the computed mass', () => {
    const p = massProperties(asset([part('c', cylinderMesh(0.5, 2, 32, 'steel_painted'))]), {
      mass: 100,
    });
    expect(p.mass).toBeCloseTo(100, 6);
    expect(p.computedMass).toBeGreaterThan(4000);
    // Solid cylinder: Izz = m r² / 2 (polygonal, so a little under).
    expect(p.inertia[2][2]).toBeCloseTo(100 * 0.25 * 0.5, 0);
  });

  it('is deterministic', () => {
    const a = asset([part('c', cylinderMesh(0.3, 1)), part('b', boxMesh([1, 2, 3], [2, 0, 0]))]);
    expect(JSON.stringify(massProperties(a))).toBe(JSON.stringify(massProperties(a)));
  });
});
