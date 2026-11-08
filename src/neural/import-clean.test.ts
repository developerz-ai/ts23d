import { describe, expect, test } from 'bun:test';
import type { Mesh } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { cleanMesh } from './import-clean.ts';

const withIndices = (m: Mesh, idx: number[]): Mesh => ({ ...m, indices: Uint32Array.from(idx) });

describe('cleanMesh', () => {
  test('a face wound against its shell is flipped back', () => {
    const c = cube();
    const idx = [...c.indices];
    [idx[1], idx[2]] = [idx[2] ?? 0, idx[1] ?? 0];
    const { report, mesh } = cleanMesh(withIndices(c, idx));
    expect(report.flipped).toBe(1);
    expect(report.shells).toEqual([{ triangles: 12, closed: true }]);
    expect([...mesh.indices]).toEqual([...c.indices]);
  });
  test('an inside-out shell is turned outward, normals with it', () => {
    const c = cube();
    const idx = [...c.indices];
    for (let t = 0; t < idx.length; t += 3)
      [idx[t + 1], idx[t + 2]] = [idx[t + 2] ?? 0, idx[t + 1] ?? 0];
    const inv = { ...withIndices(c, idx), normals: c.normals.map((v) => -v) };
    const { mesh } = cleanMesh(inv);
    expect([...mesh.indices]).toEqual([...c.indices]);
    expect([...mesh.normals]).toEqual([...c.normals]);
  });
  test('degenerate and duplicate faces are dropped', () => {
    const c = cube();
    const idx = [...c.indices, 0, 0, 1, ...c.indices.slice(0, 3)];
    const { report, mesh } = cleanMesh(withIndices(c, idx));
    expect(report.degenerate).toBe(1);
    expect(report.duplicate).toBe(1);
    expect(mesh.indices.length).toBe(36);
  });
  test('a missing face (small hole) is filled; a big hole stays open', () => {
    const c = cube();
    const holed = withIndices(c, [...c.indices].slice(6)); // drop one quad
    const filled = cleanMesh(holed);
    expect(filled.report.holesFilled).toBe(1);
    expect(filled.mesh.indices.length).toBe(36);
    expect(cleanMesh(filled.mesh).report.shells[0]?.closed).toBe(true);
    const open = cleanMesh(holed, { maxHoleEdges: 3 });
    expect(open.report.holesOpen).toBe(1);
    expect(open.report.shells[0]?.closed).toBe(false);
  });
  test('specks below minShellTris are dropped and reported', () => {
    const big = cube([2, 2, 2]);
    const speck = cube([0.1, 0.1, 0.1]);
    const n = big.positions.length / 3;
    const both: Mesh = {
      positions: Float32Array.from([...big.positions, ...speck.positions.map((v) => v + 5)]),
      normals: Float32Array.from([...big.normals, ...speck.normals]),
      uvs: Float32Array.from([...big.uvs, ...speck.uvs]),
      colors: Float32Array.from([...big.colors, ...speck.colors]),
      indices: Uint32Array.from([...big.indices, ...[...speck.indices].map((i) => i + n)]),
    };
    expect(cleanMesh(both).report.shells.length).toBe(2);
    const r = cleanMesh(both, { minShellTris: 13 });
    expect(r.report.droppedShells).toBe(2);
    expect(cleanMesh(both, { minShellTris: 12 }).report.droppedShells).toBe(0);
  });
});
