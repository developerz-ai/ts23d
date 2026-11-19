// The far station keeps its name and its flags. Failure first: LOD2's name board was a blank
// decal (a white plate) and the platform paving one stretched band that read as planks.

import { describe, expect, it } from 'bun:test';
import { compile, stripRect } from '@developerz.ai/ts23d';
import { BOARD } from './materials.ts';
import { station_halt } from './station_halt.ts';

describe('station_halt far LOD', () => {
  const far = compile(station_halt, { lod: 2 });
  const part = (name: string) => far.parts.find((p) => p.name === name)?.mesh;

  it('letters the name board on the board-name strip', () => {
    const r = stripRect(BOARD);
    const uv = part('name_board')?.uvs ?? new Float32Array();
    let lettered = 0;
    for (let i = 1; i < uv.length; i += 2)
      if ((uv[i] ?? 0) >= r.v0 && (uv[i] ?? 0) <= r.v1) lettered++;
    expect(lettered).toBe(4);
  });

  it('lays the platform flags at true scale (many bands, not one)', () => {
    const near = compile(station_halt, { lod: 0 }).parts.find((p) => p.name === 'platform')?.mesh;
    const tris = (m: typeof near) => (m?.indices.length ?? 0) / 3;
    // The 30 m paving alone is 34 bands of 0.9 m flags, 68 triangles.
    expect(tris(part('platform'))).toBeGreaterThan(68);
    expect(tris(part('platform'))).toBeLessThan(tris(near));
  });
});
