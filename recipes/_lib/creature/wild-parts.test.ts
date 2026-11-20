// wild-parts.ts: `withinBox` drops whole cards (connected pieces), whatever order a triangle lists
// its corners in, and never emits an index past the kept vertices (failure first: a triangle
// listed [2, 1, 0] used to split into two pieces and leave a dangling 0xffffffff index).

import { describe, expect, it } from 'bun:test';
import type { Mesh } from '@developerz.ai/ts23d';
import { withinBox } from './wild-parts.ts';

/** Triangles over the given points (unit normals, flat UVs and colours). */
function mesh(points: readonly (readonly [number, number, number])[], tris: number[]): Mesh {
  const n = points.length;
  return {
    positions: new Float32Array(points.flat()),
    normals: new Float32Array(n * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)),
    uvs: new Float32Array(n * 2),
    colors: new Float32Array(n * 3).fill(1),
    indices: new Uint32Array(tris),
  };
}

describe('withinBox', () => {
  it('drops a whole card listed in reverse corner order when one corner leaves the box', () => {
    // Card 1: vertices 0..2, listed [2, 1, 0]; only vertex 1 is outside |y| <= 0.5.
    // Card 2: vertices 3..5, inside.
    const cards = mesh(
      [
        [0, 0, 0],
        [0, 1, 0],
        [1, 0, 0],
        [0, 0, 0.1],
        [0, 0.1, 0.1],
        [0.1, 0, 0.1],
      ],
      [2, 1, 0, 3, 4, 5],
    );
    const kept = withinBox(cards, { y: 0.5 });
    expect(kept.positions.length / 3).toBe(3);
    expect([...kept.indices]).toEqual([0, 1, 2]);
  });

  it('keeps every index inside the kept vertices for any corner order', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 0.1],
      [0, 0.1, 0.1],
      [0.1, 0, 0.1],
    ];
    for (const order of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      const kept = withinBox(mesh(points, [...order, 3, 4, 5]), { y: 0.5 });
      const n = kept.positions.length / 3;
      expect(n).toBe(3);
      for (const i of kept.indices) expect(i).toBeLessThan(n);
    }
  });

  it('drops a card joined by a later triangle through its first corner', () => {
    // Two triangles sharing vertex 2 form one card; vertex 3 is outside, so all four go.
    const cards = mesh(
      [
        [0, 0, 0],
        [0.1, 0, 0],
        [0, 0.1, 0],
        [0, 0, 2],
      ],
      [2, 1, 0, 3, 2, 1],
    );
    expect(withinBox(cards, { z: 1 }).indices.length).toBe(0);
  });
  it('keeps the skin of the cards it keeps (joints and weights, four per vertex)', () => {
    // Card 1 (vertices 0..2, bone 3) leaves the box; card 2 (vertices 3..5, bone 7) stays.
    const cards: Mesh = {
      ...mesh(
        [
          [0, 0, 0],
          [0, 1, 0],
          [1, 0, 0],
          [0, 0, 0.1],
          [0, 0.1, 0.1],
          [0.1, 0, 0.1],
        ],
        [0, 1, 2, 3, 4, 5],
      ),
      joints: new Uint16Array([
        3, 0, 0, 0, 3, 0, 0, 0, 3, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0,
      ]),
      weights: new Float32Array(Array.from({ length: 6 }, () => [1, 0, 0, 0]).flat()),
    };
    const kept = withinBox(cards, { y: 0.5 });
    expect([...(kept.joints ?? [])]).toEqual([7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 0]);
    expect(kept.weights?.length).toBe(12);
  });
});
