// Relief strokes on the face base: a stroke moves only what lies inside its radius, along the
// normal, by its height at the axis; strokes too fine for the mesh are dropped; a character's
// marks stay few.

import { describe, expect, it } from 'bun:test';
import { createRng } from '@developerz.ai/ts23d';
import type { QuadMesh } from './base.ts';
import { faceHead } from './head.ts';
import { GOBLIN, ORC } from './races.ts';
import { characterStrokes, molesOf, relieve, segDist, wartsOf } from './relief.ts';
import { type Character, HUMAN } from './spec.ts';

/** A flat 5 × 5 grid of 1 cm quads in the plane z = 0, facing +Z. */
function grid(): QuadMesh {
  const p: number[] = [];
  const q: number[] = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) p.push(i * 0.01, j * 0.01, 0);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) q.push(j * 5 + i, j * 5 + i + 1, j * 5 + i + 6, j * 5 + i + 5);
  return { p: new Float64Array(p), q: new Uint32Array(q) };
}

const person = (race: Character['race'], extra: Partial<Character> = {}): Character => ({
  race,
  age: 0.5,
  weight: 0,
  asym: 0,
  tone: {
    base: [0.7, 0.5, 0.4],
    flush: [0.8, 0.4, 0.4],
    lips: [0.7, 0.4, 0.4],
    cool: [0.6, 0.5, 0.5],
    cavity: [0.3, 0.2, 0.2],
  },
  eyes: { iris: [0.3, 0.4, 0.5] },
  ...extra,
});

describe('relieve', () => {
  it('fails a stroke that moves a vertex outside its radius', () => {
    const m = grid();
    const out = relieve(m, [{ a: [0.02, 0.02, 0], b: [0.02, 0.02, 0], r: 0.012, h: 0.002 }]);
    for (let v = 0; v < 25; v++) {
      const d = Math.hypot((m.p[v * 3] ?? 0) - 0.02, (m.p[v * 3 + 1] ?? 0) - 0.02);
      const dz = Math.abs(out.p[v * 3 + 2] ?? 0);
      if (d >= 0.012) expect(dz).toBe(0);
      else expect(dz).toBeGreaterThan(0);
    }
    // Full height at the axis, along the normal.
    expect(Math.abs(out.p[12 * 3 + 2] ?? 0)).toBeCloseTo(0.002, 9);
  });

  it('drops strokes finer than `min` and then returns the mesh untouched', () => {
    const m = grid();
    const fine = [{ a: [0.02, 0.02, 0], b: [0.02, 0.02, 0], r: 0.004, h: 0.002 }] as const;
    expect(relieve(m, fine, 0.008)).toBe(m);
    expect(relieve(m, fine)).not.toBe(m);
  });

  it('measures the distance to a segment, not to its line', () => {
    expect(segDist([3, 4, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(Math.hypot(2, 4), 12);
    expect(segDist([0.5, 2, 0], [0, 0, 0], [1, 0, 0])).toBeCloseTo(2, 12);
  });
});

describe('a character’s marks', () => {
  const head = faceHead(person(HUMAN), createRng(1));

  it('never more than five moles or eight warts, however many are asked', () => {
    expect(molesOf(head, 40, createRng(2)).length).toBe(5);
    expect(wartsOf(head, 40, createRng(2)).length).toBe(8);
    expect(molesOf(head, 3, createRng(2)).length).toBe(3);
  });

  it('gives a brow shelf only to a race whose brow comes forward', () => {
    const ridge = (c: Character): number =>
      characterStrokes(faceHead(c, createRng(1)), c, createRng(3)).filter((s) => s.h > 0).length;
    expect(ridge(person(HUMAN))).toBe(0);
    expect(ridge(person(ORC))).toBe(4);
    // Warts are raised strokes too.
    expect(ridge(person(GOBLIN, { warts: 6 }))).toBe(6);
  });

  it('deepens the folds with age', () => {
    const fold = (age: number): number => {
      const c = person(HUMAN, { age });
      const s = characterStrokes(faceHead(c, createRng(1)), c, createRng(3))[0];
      return s ? s.h : 0;
    };
    expect(fold(0.9)).toBeLessThan(fold(0.1));
    expect(fold(0.1)).toBeLessThan(0);
  });
});
