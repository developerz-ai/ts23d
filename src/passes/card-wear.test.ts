import { describe, expect, it } from 'bun:test';
import { dmath, Ts23dError, type Vec3 } from '../core/index.ts';
import { cardWear } from './card-wear.ts';
import { at, run } from './hair-fixtures.ts';

const cards = run().mesh;

/** Each vertex's card (connected piece) as the lowest vertex index in it. */
function pieceOf(m: typeof cards): number[] {
  const parent = Array.from({ length: m.positions.length / 3 }, (_, i) => i);
  const find = (v: number): number => {
    while ((parent[v] ?? v) !== v) v = parent[v] ?? v;
    return v;
  };
  for (let t = 0; t < m.indices.length; t += 3)
    for (const k of [1, 2]) {
      const a = find(m.indices[t] ?? 0);
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  return parent.map((_, v) => find(v));
}

const rootOf = (m: typeof cards, v: number): Vec3 => {
  const [a, b] = [at(m, v), at(m, v + 1)];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
};

describe('cardWear', () => {
  it('paints every vertex of a card from the point under its root, not where the vertex hangs', () => {
    // A stain that changes along the cylinder: a vertex sampled where it hangs gets its own x.
    const out = cardWear(cards, { paint: (p, _n, c) => [p[0], c[1], c[2]] });
    const ids = pieceOf(out);
    let cardsChecked = 0;
    ids.forEach((id, v) => {
      if (id === v) cardsChecked++;
      expect(out.colors[v * 3] ?? -1).toBeCloseTo(rootOf(cards, id)[0], 5);
      // The rest of the colour (the root → tip tone) is the card's own.
      expect(out.colors[v * 3 + 1] ?? -1).toBeCloseTo(cards.colors[v * 3 + 1] ?? 0, 6);
    });
    expect(cardsChecked).toBeGreaterThan(20);
  });

  it('passes the root in world space (`at` = the part offset) and a unit skin-side normal', () => {
    const seen: Vec3[] = [];
    cardWear(
      cards,
      {
        paint: (p, n, c) => {
          seen.push(p);
          expect(dmath.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
          return c;
        },
      },
      [10, 0, 0],
    );
    expect(Math.min(...seen.map((p) => p[0]))).toBeGreaterThan(9.99);
  });

  it('shortens a card toward its root by `keep`, and the root stays where it was', () => {
    const out = cardWear(cards, { keep: (p) => (p[0] < 0.5 ? 0.3 : 1) });
    const ids = pieceOf(cards);
    let short = 0;
    ids.forEach((id, v) => {
      const r = rootOf(cards, id);
      const k = r[0] < 0.5 ? 0.3 : 1;
      const p = at(cards, v);
      const q = at(out, v);
      for (let i = 0; i < 3; i++)
        expect(q[i] ?? 0).toBeCloseTo((r[i] ?? 0) + ((p[i] ?? 0) - (r[i] ?? 0)) * k, 5);
      if (k < 1 && id !== v) short++;
    });
    expect(short).toBeGreaterThan(0);
    const roots = (m: typeof cards): Vec3[] =>
      pieceOf(m).flatMap((id, v) => (id === v ? [rootOf(m, v)] : []));
    roots(out).forEach((r, i) => {
      for (let k = 0; k < 3; k++) expect(r[k] ?? 0).toBeCloseTo(roots(cards)[i]?.[k] ?? 9, 6);
    });
  });

  it('is the identity without paint or keep', () => {
    const out = cardWear(cards, {});
    expect(out.positions).toEqual(cards.positions);
    expect(out.colors).toEqual(cards.colors);
  });

  it('keeps every vertex its own skin while it paints and shortens the cards', () => {
    // Different joints and weights per vertex: a dropped, shared or reordered skin shows.
    const verts = cards.positions.length / 3;
    const joints = Uint16Array.from(
      { length: verts * 4 },
      (_, i) => (Math.floor(i / 4) % 7) + (i % 4),
    );
    const weights = Float32Array.from({ length: verts * 4 }, (_, i) =>
      i % 4 === 0 ? 0.4 + (Math.floor(i / 4) % 5) * 0.1 : (0.6 - (Math.floor(i / 4) % 5) * 0.1) / 3,
    );
    const skinned = { ...cards, joints, weights };
    const out = cardWear(skinned, {
      paint: (p, _n, c) => [p[0], c[1], c[2]],
      keep: (p) => (p[0] < 0.5 ? 0.3 : 1),
    });
    expect(out.positions).not.toEqual(cards.positions);
    expect(out.colors).not.toEqual(cards.colors);
    expect(out.joints).toEqual(Uint16Array.from(joints));
    expect(out.weights).toEqual(Float32Array.from(weights));
  });

  it('refuses a keep outside 0..1 with a fix', () => {
    expect(() => cardWear(cards, { keep: () => 1.5 })).toThrow(Ts23dError);
    expect(() => cardWear(cards, { keep: () => Number.NaN })).toThrow(/0\.\.1/);
  });
});
