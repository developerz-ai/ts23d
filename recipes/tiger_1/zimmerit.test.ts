// Zimmerit coating: flakes are real cuts (bare floor where the field says flaked, none where it
// does not), the slab is seated in the plate, the strip's texels resolve the true ridge pitch, and
// the far-LOD mantlet (plate faces moved onto the strip) keeps the turret's coarser pitch.
import { describe, expect, it } from 'bun:test';
import { box, compile, createRng, type Mesh, stripRect } from '@developerz.ai/ts23d';
import { tiger_1 } from './tiger_1.ts';
import {
  type CoatWall,
  coatFaces,
  coating,
  HULL_PITCH,
  TURRET_PITCH,
  ZIMMERIT,
} from './zimmerit.ts';

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
/**
 * World ridge pitch on the upright faces `coatFaces` moved onto the strip: the strip draws one
 * ridge per HULL_PITCH of its own length, so pitch = HULL_PITCH × rise / strip metres travelled.
 * Median over every such triangle edge; NaN when the mesh has none.
 */
const ridgePitch = (m: Mesh): number => {
  const zr = stripRect(ZIMMERIT);
  const mid = (zr.v0 + zr.v1) / 2;
  const z = (i: number): number => m.positions[i * 3 + 2] ?? 0;
  const stripM = (i: number): number =>
    (((m.uvs[i * 2] ?? 0) - zr.u0) / (zr.u1 - zr.u0)) * zr.metres;
  const found: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t] ?? 0, m.indices[t + 1] ?? 0, m.indices[t + 2] ?? 0];
    const upright = ids.every((i) => Math.abs(m.normals[i * 3 + 2] ?? 1) < 0.01);
    if (!upright || ids.some((i) => Math.abs((m.uvs[i * 2 + 1] ?? 0) - mid) > 1e-6)) continue;
    const [a = 0, b = 0, c = 0] = ids;
    for (const [lo, hi] of [[a, b] as const, [b, c] as const]) {
      const rise = z(hi) - z(lo);
      if (Math.abs(rise) > 0.01) found.push((HULL_PITCH * rise) / (stripM(hi) - stripM(lo)));
    }
  }
  found.sort((p, q) => p - q);
  return found[found.length >> 1] ?? Number.NaN;
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

  it('the far-LOD mantlet carries the turret ridge pitch, not the hull default', () => {
    // The measure tells the two apart: the same plate coated without a pitch reads the hull's.
    const slab = box({ size: [0.1, 1, 0.6], color: [1, 1, 1] });
    const front = (_c: readonly number[], n: readonly number[]): boolean => (n[0] ?? 0) > 0.9;
    expect(ridgePitch(coatFaces(slab, front))).toBeCloseTo(HULL_PITCH, 5);
    expect(ridgePitch(coatFaces(slab, front, TURRET_PITCH))).toBeCloseTo(TURRET_PITCH, 5);
    for (const lod of [1, 2] as const) {
      const mantlet = compile(tiger_1, { lod }).parts.find((p) => p.name === 'gun_mantlet')?.mesh;
      expect(mantlet ? ridgePitch(mantlet) : Number.NaN).toBeCloseTo(TURRET_PITCH, 4);
    }
  });
});
