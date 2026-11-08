import { describe, expect, it } from 'bun:test';
import { createRng, Ts23dError, type Vec3 } from '@developerz.ai/ts23d';
import { faceBase } from './base.ts';
import { faceHead } from './head.ts';
import { BASE_H, baseLandmarks, LEFT, MIDLINE } from './landmarks.ts';
import { RACES } from './races.ts';
import { type Character, HUMAN } from './spec.ts';
import { warpPairs } from './targets.ts';

const TONE = {
  base: [0.8, 0.6, 0.5],
  flush: [0.8, 0.5, 0.4],
  lips: [0.7, 0.4, 0.4],
  cool: [0.6, 0.5, 0.5],
  cavity: [0.3, 0.2, 0.2],
} as const;
const who = (race = HUMAN, o: Partial<Character> = {}): Character => ({
  race,
  age: 0,
  weight: 0,
  asym: 0,
  tone: TONE,
  eyes: { iris: [0.3, 0.4, 0.5] },
  ...o,
});
const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

describe('face base + landmark warp', () => {
  it('rejects a preset that collapses the head (T3D_RECIPE_INVALID with a fix)', () => {
    const e = fails(() => faceHead(who({ ...HUMAN, scale: 0 }), createRng(1)));
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.fix).toContain('ratio');
    expect(fails(() => faceHead(who(HUMAN, { asym: -1 }), createRng(1))).code).toBe(
      'T3D_RECIPE_INVALID',
    );
  });

  it('decodes the CC0 base: quads index real vertices, mirror partners are mirrored', () => {
    const { mesh, mirror } = faceBase();
    const V = mesh.p.length / 3;
    expect(V).toBe(5709);
    expect(mesh.q.length / 4).toBe(5654);
    for (const i of mesh.q) expect(i).toBeLessThan(V);
    for (let v = 0; v < V; v += 97) {
      const u = mirror[v] ?? 0;
      expect(Math.abs((mesh.p[v * 3 + 1] ?? 0) + (mesh.p[u * 3 + 1] ?? 0))).toBeLessThan(2e-4);
    }
  });

  it('every surface landmark sits on a base vertex (within 0.5 mm)', () => {
    const { p } = faceBase().mesh;
    for (const [name, at] of baseLandmarks()) {
      if (name.startsWith('eye_')) continue; // the eyeball centre is inside the socket
      let best = Number.POSITIVE_INFINITY;
      for (let v = 0; v < p.length; v += 3)
        best = Math.min(
          best,
          Math.hypot((p[v] ?? 0) - at[0], (p[v + 1] ?? 0) - at[1], (p[v + 2] ?? 0) - at[2]),
        );
      expect(best).toBeLessThan(5e-4);
    }
  });

  it('the human preset is the identity: the warped mesh IS the base', () => {
    const base = faceBase().mesh.p;
    const h = faceHead(who(), createRng(1));
    let worst = 0;
    for (let i = 0; i < base.length; i++)
      worst = Math.max(worst, Math.abs((h.mesh.p[i] ?? 0) - (base[i] ?? 0)));
    expect(worst).toBeLessThan(1e-9);
    expect(BASE_H).toBeCloseTo(0.2336, 4);
  });

  it('the orc jaw lands on its declared ratio (bigonial ×1.35 × head scale)', () => {
    const orc = RACES.orc;
    const h = faceHead(who(orc), createRng(1));
    const g = h.map(LEFT.gonion);
    const pivotY = 0;
    expect((g[1] - pivotY) / LEFT.gonion[1]).toBeCloseTo(orc.jaw.width * orc.scale, 3);
    // …and a goblin's nose projects past the human's.
    const gob = faceHead(who(RACES.goblin), createRng(1));
    const tipPast = (m: (p: Vec3) => Vec3, s: number): number =>
      (m(MIDLINE.pronasale)[0] - m(MIDLINE.subnasale)[0]) / s;
    expect(tipPast(gob.map, RACES.goblin.scale)).toBeGreaterThan(
      2 * tipPast(faceHead(who(), createRng(1)).map, 1),
    );
  });

  it('is deterministic, and asymmetry is seeded', () => {
    const c = who(RACES.elf, { asym: 1, age: 0.5, weight: 0.3 });
    const a = warpPairs(c, createRng(7));
    const b = warpPairs(c, createRng(7));
    expect(b.to).toEqual(a.to);
    const d = warpPairs(c, createRng(8));
    expect(d.to).not.toEqual(a.to);
    expect(a.from.length).toBe(a.to.length);
    expect(a.from.length).toBeGreaterThanOrEqual(40);
  });
});
