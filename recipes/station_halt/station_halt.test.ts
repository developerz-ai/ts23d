// The far station keeps its name and its flags. Failure first: LOD2's name board was a blank
// decal (a white plate) and the platform paving one stretched band that read as planks.

import { describe, expect, it } from 'bun:test';
import { compile, DEFAULT_SHEET, sheetFor, stripRect } from '@developerz.ai/ts23d';
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

  it('the board quad shows painted lettering: glyph and ground texels across the whole name', () => {
    // A blank painter (the white-plate regression) leaves the strip one tone; a quad mapped onto
    // a slice of the strip shows only part of the name.
    const r = stripRect(BOARD);
    const uv = part('name_board')?.uvs ?? new Float32Array();
    const us: number[] = [];
    for (let i = 0; i + 1 < uv.length; i += 2)
      if ((uv[i + 1] ?? 0) >= r.v0 && (uv[i + 1] ?? 0) <= r.v1) us.push(uv[i] ?? 0);
    expect(Math.min(...us)).toBeCloseTo(r.u0, 6);
    expect(Math.max(...us)).toBeCloseTo(r.u1, 6);
    const sheet = sheetFor([far], { ...DEFAULT_SHEET, size: 1024 });
    let [glyph, ground, n] = [0, 0, 0];
    for (let i = 0; i < 400; i++)
      for (let j = 0; j < 8; j++) {
        const x = Math.floor((r.u0 + ((i + 0.5) / 400) * (r.u1 - r.u0)) * sheet.size);
        const y = Math.floor((r.v0 + ((j + 0.5) / 8) * (r.v1 - r.v0)) * sheet.size);
        const a = sheet.albedo[(y * sheet.size + x) * 4] ?? 0;
        n++;
        if (a >= 200) glyph++;
        if (a <= 60) ground++;
      }
    expect(glyph / n).toBeGreaterThan(0.2);
    expect(ground / n).toBeGreaterThan(0.3);
  });

  it('lays the platform flags at true scale (many bands, not one)', () => {
    const near = compile(station_halt, { lod: 0 }).parts.find((p) => p.name === 'platform')?.mesh;
    const tris = (m: typeof near) => (m?.indices.length ?? 0) / 3;
    // The 30 m paving alone is 34 bands of 0.9 m flags, 68 triangles.
    expect(tris(part('platform'))).toBeGreaterThan(68);
    expect(tris(part('platform'))).toBeLessThan(tris(near));
  });
});
