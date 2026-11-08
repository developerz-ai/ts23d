// The specimen shows every TextFont, raised at LOD0/1 and flush at LOD2, and its lettering costs
// fall with the LOD knob. Failure case first: a face that silently drops out of TEXT_FONTS
// coverage (or a row typed in an unsupported character) would throw here, not ship blank.
import { describe, expect, it } from 'bun:test';
import { compile, type Lod, TEXT_FONTS, Ts23dError, text } from '@developerz.ai/ts23d';
import { type_specimen } from './type_specimen.ts';

const board = (lod: Lod) => {
  const p = compile(type_specimen, { lod }).parts.find((q) => q.name === 'board');
  if (!p?.mesh) throw new Error('type_specimen has no board mesh');
  return p.mesh;
};

describe('type_specimen', () => {
  it('refuses a character no vector face has, so a typo cannot ship a blank row', () => {
    expect(() =>
      text('Ärger', { origin: [0, 0, 0], height: 0.1, color: [1, 1, 1], font: 'serif' }),
    ).toThrow(Ts23dError);
  });

  it('sets every face, raised walls only at LOD0/1, triangles falling with LOD', () => {
    expect(TEXT_FONTS).toHaveLength(6);
    const tris = ([0, 1, 2] as const).map((l) => board(l).indices.length / 3);
    expect(tris[0] ?? 0).toBeGreaterThan(tris[1] ?? 0);
    expect(tris[1] ?? 0).toBeGreaterThan(tris[2] ?? 0);
    // Letter walls face sideways (normal ⟂ +X), proud of the board face, inside the frame and
    // clear of the divider (|y| 0.05–1.5 m, z 0.87–2.63 m).
    const walls = (lod: Lod): number => {
      const m = board(lod);
      let n = 0;
      for (let i = 0; i < m.positions.length; i += 3) {
        const [x = 0, y = 0, z = 0] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]];
        const inside = Math.abs(y) > 0.05 && Math.abs(y) < 1.5 && z > 0.87 && z < 2.63;
        if (inside && x > 0.1001 && Math.abs(m.normals[i] ?? 0) < 1e-6) n++;
      }
      return n;
    };
    expect(walls(0)).toBeGreaterThan(1000);
    expect(walls(2)).toBe(0);
  });
});
