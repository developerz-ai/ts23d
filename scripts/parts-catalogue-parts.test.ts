// Every part in recipes/_parts at every LOD: closed, outward, finite, sane colours, cached,
// LOD-monotone, and documented. Lives in scripts/ because the gate's `bun test` covers
// src, scripts and examples — not recipes/.

import { describe, expect, it } from 'bun:test';
import { PARTS } from '../recipes/_parts/index.ts';
import { type AnyPart, type Lod, type Mesh, triangleCount } from '../src/index.ts';
import { meshProblems } from './parts-catalogue-check.ts';

const LODS: readonly Lod[] = [0, 1, 2];

/** The defaults, plus one override per choice of every `oneOf` param (styles, sizes). */
const variants = (part: AnyPart): Record<string, unknown>[] => [
  {},
  ...part.info.params.flatMap((p) => (p.oneOf ?? []).map((v) => ({ [p.name]: v }))),
];

describe('meshProblems', () => {
  it('flags an inside-out and an open mesh (the check can fail)', () => {
    const tri: Mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array(6),
      colors: new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 2]),
      indices: new Uint32Array([0, 1, 2]),
    };
    const p = meshProblems(tri).join('; ');
    expect(p).toContain('open edges');
    expect(p).toContain('inside-out');
    expect(p).toContain('vertex colour');
  });
});

describe('parts kit', () => {
  it('has unique snake_case names, a description, tags and documented params', () => {
    const names = PARTS.map((p) => p.info.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PARTS) {
      expect(p.info.description.length).toBeGreaterThan(10);
      expect(p.info.tags.length).toBeGreaterThan(0);
      for (const prm of p.info.params)
        expect(
          prm.doc !== undefined || prm.min !== undefined || prm.oneOf !== undefined,
          `${p.info.name}.${prm.name} has no doc, range or choices`,
        ).toBe(true);
    }
  });

  for (const part of PARTS)
    it(`${part.info.name}: closed, outward, finite, lighter per LOD, cached`, () => {
      const tris: number[] = [];
      for (const lod of LODS) {
        for (const o of variants(part))
          for (const pc of part.pieces(o, lod))
            if (pc.mesh)
              expect(
                meshProblems(pc.mesh),
                `${part.info.name} ${JSON.stringify(o)} LOD${lod} ${pc.name}`,
              ).toEqual([]);
        tris.push(triangleCount(part.mesh({}, lod)));
      }
      expect(tris[0], `${part.info.name} LOD0 is empty`).toBeGreaterThan(0);
      expect(tris[1] ?? 0).toBeLessThanOrEqual(tris[0] ?? 0);
      expect(tris[2] ?? 0).toBeLessThanOrEqual(tris[1] ?? 0);
      // Same params + LOD → the cached build (Math.random is sealed by the test preload).
      expect(part.mesh({}, { lod: 0 })).toBe(part.mesh({}, 0));
    });
});
