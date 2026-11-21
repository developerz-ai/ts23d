// Strand lobes: never more energy out than in (and white fibres lose none), darker fibres reflect
// less, a card lit from the front sends most light back like the coat it stands for (D476), the
// primary highlight sits off the mirror direction (cuticle tilt), forward scatter beats sideways.
// Smooth fibres gather their light into a sheen band about the specular cone (D541), and a bent
// card's tangent turns from vertex to vertex (D540).

import { describe, expect, it } from 'bun:test';
import { dmath } from '../../core/index.ts';
import { CLS } from './classes.ts';
import { evalHair, sampleSphere, strandTangents } from './hair.ts';

const T = [0, 0, 1];
const f = new Float64Array(3);
const wi = new Float64Array(3);

/**
 * Directional albedo of a strand (card facing wo) by stratified uniform-sphere quadrature; `lit`
 * counts only the light leaving on the card's front (the side wo is on).
 */
function energy(albedo: number, wo: number[], lit = false, rough = 0.5): number {
  let s = 0;
  const n = 300;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const p = sampleSphere((a + 0.5) / n, (b + 0.5) / n, wi);
      const front =
        (wo[0] ?? 0) * (wi[0] ?? 0) + (wo[1] ?? 0) * (wi[1] ?? 0) + (wo[2] ?? 0) * (wi[2] ?? 0);
      if (lit && front < 0) continue;
      evalHair(T, wo, [albedo, albedo, albedo], rough, wo, wi, f);
      s += (f[0] ?? 0) / p;
    }
  return s / (n * n);
}

const VIEWS = [
  [1, 0, 0],
  [0.6, 0, 0.8],
  [0, 0.6, -0.8],
  [0, 0, 1],
];

describe('hair lobes', () => {
  it('a black fibre still shows a white primary highlight but little else', () => {
    expect(energy(0, [1, 0, 0])).toBeLessThan(0.2);
    expect(energy(0, [1, 0, 0])).toBeGreaterThan(0.01);
  });

  it('white fibres conserve energy from any view, and absorb none of it', () => {
    for (const wo of VIEWS) {
      const e = energy(1, wo);
      expect(e).toBeLessThan(1);
      expect(e).toBeGreaterThan(0.95);
    }
  });

  // D476: a card shaded at 0.7 of a matte surface of its own colour (0.8 diffuse × 0.85 to the lit
  // side) read darker than the skin it grows from, so recipes brightened their fur by hand.
  it('a card sends most light back to its lit side, like the coat it stands for', () => {
    for (const wo of VIEWS) expect(energy(1, wo, true)).toBeGreaterThan(0.85);
  });

  it('puts the R highlight off the mirror direction (cuticle tilt)', () => {
    const wo = [1, 0, 0];
    const at = (deg: number): number => {
      const a = (deg * Math.PI) / 180;
      evalHair(T, wo, [0, 0, 0], 0.2, wo, [dmath.cos(a), 0, dmath.sin(a)], f);
      return f[0] ?? 0;
    };
    // Mirror about the strand normal is θi = −θo = 0; the tilt moves the peak to θi ≈ 2α ≠ 0.
    expect(at(-8)).toBeGreaterThan(at(8));
  });

  it('scatters forward through the fibre more than sideways', () => {
    const wo = [1, 0, 0];
    evalHair(T, [0, 0, 0], [0.8, 0.8, 0.8], 0.3, wo, [-1, 0, 0], f);
    const forward = f[0] ?? 0;
    evalHair(T, [0, 0, 0], [0.8, 0.8, 0.8], 0.3, wo, [0, 1, 0], f);
    expect(forward).toBeGreaterThan(f[0] ?? 0);
  });

  // Across the strand a smooth white fibre returns nearly all its light; seen along the strand
  // the sheen band is out of reach, so it returns less, never more.
  it('smooth white fibres never return more light than they receive', () => {
    for (const wo of VIEWS) expect(energy(1, wo, false, 0.4)).toBeLessThan(1);
    expect(energy(1, [1, 0, 0], false, 0.4)).toBeGreaterThan(0.9);
    expect(energy(1, [0, 0, 1], false, 0.4)).toBeLessThan(energy(1, [1, 0, 0], false, 0.4));
  });

  // D525: the lobes carried a hundredth of the light, so head hair showed no sheen band at all
  // and read as straw. A smooth fibre's band must stand well above its diffuse shoulder.
  it('a smooth fibre shows a sheen band along the strand, a rough one stays matte', () => {
    const n = [1, 0, 0];
    const at = (rough: number, deg: number): number => {
      const a = (deg * Math.PI) / 180;
      evalHair(T, n, [0.6, 0.5, 0.3], rough, n, [dmath.cos(a), 0, dmath.sin(a)], f);
      return (f[0] ?? 0) / dmath.cos(a);
    };
    // Lit from the camera's side, the highlight sits near the mirror (θi ≈ 2α) and falls off
    // within a few tens of degrees; the cosine is divided out so only the lobes remain.
    expect(at(0.4, -8) / at(0.4, -40)).toBeGreaterThan(at(0.5, -8) / at(0.5, -40) + 0.06);
    expect(at(0.5, -8) / at(0.5, -40)).toBeLessThan(1.12);
  });

  // D541: the band stood 6 % above its shoulder (R and TRT are a sliver beside the matte
  // many-fibre term), so path-traced head hair still read as raffia. The many-fibre term itself
  // gathers about the cone: the band is half again as bright as 40° off it, and 60° off the
  // fibre is darker than a matte one.
  it('gathers the light of a smooth fibre into a band well above its shoulders', () => {
    const n = [1, 0, 0];
    const at = (rough: number, deg: number): number => {
      const a = (deg * Math.PI) / 180;
      evalHair(T, n, [0.6, 0.5, 0.3], rough, n, [dmath.cos(a), 0, dmath.sin(a)], f);
      return (f[0] ?? 0) / dmath.cos(a);
    };
    expect(at(0.4, -8) / at(0.4, -40)).toBeGreaterThan(1.5);
    expect(at(0.4, 8) / at(0.4, 60)).toBeGreaterThan(1.5);
    expect(at(0.4, -60)).toBeLessThan(at(0.5, -60) * 0.6);
    expect(at(0.4, 0)).toBeGreaterThan(at(0.5, 0));
  });

  it('keeps a rough fibre (fur) exactly as it was before D525', () => {
    const wo = [0.6, 0, 0.8];
    evalHair(T, wo, [0.5, 0.4, 0.3], 0.5, wo, [0.8, 0.6, 0], f);
    expect(f[0]).toBeCloseTo(0.06657639203803263, 12);
    const a = -0.14;
    evalHair(T, [1, 0, 0], [0.5, 0.4, 0.3], 0.5, [1, 0, 0], [dmath.cos(a), 0, dmath.sin(a)], f);
    expect(f[2]).toBeCloseTo(0.08305250970328862, 12);
  });
});

// D540: one tangent per triangle lit each flat segment of a bent card as a plate.
describe('strand tangents', () => {
  // A card of two segments bent 90° at its middle row (vertices 2, 3): along +X, then along +Z.
  const positions = new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1]);
  const indices = new Uint32Array([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5]);
  const tangents = new Float32Array(4 * 6);
  for (let t = 0; t < 4; t++) tangents.set(t < 2 ? [1, 0, 0] : [0, 0, 1], t * 6);
  const scene = { positions, indices, tangents, triangles: 4 };

  it('gives a vertex shared by two segments the mean of their tangents', () => {
    const s = strandTangents(scene, new Uint8Array(4).fill(CLS.hair));
    expect([...s.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...s.slice(12, 15)]).toEqual([0, 0, 1]);
    for (const v of [2, 3]) {
      expect(s[v * 3]).toBeCloseTo(Math.SQRT1_2, 6);
      expect(s[v * 3 + 1]).toBeCloseTo(0, 6);
      expect(s[v * 3 + 2]).toBeCloseTo(Math.SQRT1_2, 6);
    }
  });

  it('reads hair cards only, and is empty without any', () => {
    expect(strandTangents(scene, new Uint8Array(4)).length).toBe(0);
    const s = strandTangents(scene, new Uint8Array([CLS.hair, CLS.hair, CLS.pbr, CLS.pbr]));
    expect([...s.slice(6, 9)]).toEqual([1, 0, 0]);
    expect([...s.slice(12, 15)]).toEqual([0, 0, 0]);
  });
});
