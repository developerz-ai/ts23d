// Zimmerit coating: flakes are real cuts (bare floor where the field says flaked, none where it
// does not), the slab is seated in the plate, and the strip's texels resolve the true ridge pitch.
import { describe, expect, it } from 'bun:test';
import { createRng, type Mesh, stripRect } from '@developerz.ai/ts23d';
import { type CoatWall, coating, HULL_PITCH, ZIMMERIT } from './zimmerit.ts';

const plate: CoatWall = {
  path: [
    [1, 1],
    [-1, 1],
  ],
  z0: 1,
  z1: 1.6,
};
const coatOf = (flake: number) =>
  coating([plate], {
    ds: 0.043,
    dt: 0.035,
    flake: () => flake,
    paint: [0.7, 0.6, 0.4],
    paste: [0.6, 0.6, 0.5],
    primer: [0.6, 0.3, 0.2],
    rng: createRng(1),
  });
/** Triangles facing out of the plate (+Y), i.e. coat or floor faces, not step walls. */
const facesOut = (m: Mesh): number => {
  let n = 0;
  for (let t = 0; t < m.indices.length; t += 3)
    if ((m.normals[(m.indices[t] ?? 0) * 3 + 1] ?? 0) > 0.9) n++;
  return n;
};

describe('tiger_1 zimmerit', () => {
  it('a fully flaked plate keeps no painted coat face, only a bare primer floor', () => {
    const c = coatOf(1);
    expect(facesOut(c.coat)).toBe(0);
    expect(facesOut(c.bare)).toBeGreaterThan(0);
  });

  it('an intact plate has no bare floor and a coat face 6 mm proud', () => {
    const c = coatOf(0);
    expect(c.bare.indices.length).toBe(0);
    expect(facesOut(c.coat)).toBeGreaterThan(0);
    const ys = Array.from(
      { length: c.coat.positions.length / 3 },
      (_, i) => c.coat.positions[i * 3 + 1] ?? 0,
    );
    expect(Math.max(...ys)).toBeCloseTo(1.006, 5);
    // Seated: the rim sinks into the plate rather than hovering off it.
    expect(Math.min(...ys)).toBeLessThan(1);
  });

  it('the strip resolves the hull ridge pitch along U (≥ 8 texels per ridge at 4096 px)', () => {
    const texel = stripRect(ZIMMERIT).metres / 4096;
    expect(HULL_PITCH / texel).toBeGreaterThanOrEqual(8);
  });
});
