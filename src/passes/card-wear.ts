// Wear carried by hair and fur cards themselves. A card painted per vertex where the vertex hangs
// samples a stain (mud, a scar, a matted streak) in the air above the skin, so every card of a
// coat comes out a smear of whatever lies along its length and the wear under the coat is lost.
// `cardWear` takes each card (connected piece) at its buried root — the midpoint of its first two
// vertices, the `hairCards` contract — and paints the whole card from the skin there, then shortens
// it toward that root by a share of its length: matted fur lies short and clumped, a scar parts the
// coat down to the skin. The root never moves, so the card stays rooted and keeps its skinning.

import { dmath, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';

export interface CardWearOptions {
  /** A card's colour from its root (world point, skin-side unit normal) and each vertex's own
   *  colour (so the root → tip tone a tint leaves alone survives). Omitted: colours untouched. */
  readonly paint?: (root: Vec3, n: Vec3, c: Vec3) => Vec3;
  /** Share of the card's length kept, 0..1, from its root (1 untouched). Omitted: all kept. */
  readonly keep?: (root: Vec3, n: Vec3) => number;
}

/** Each vertex's card: the lowest vertex index of its connected piece. */
function cardOf(m: Mesh): Int32Array {
  const parent = new Int32Array(m.positions.length / 3).map((_, i) => i);
  const find = (v: number): number => {
    let r = v;
    while ((parent[r] ?? r) !== r) r = parent[r] ?? r;
    while ((parent[v] ?? v) !== r) {
      const next = parent[v] ?? r;
      parent[v] = r;
      v = next;
    }
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3)
    for (const k of [1, 2]) {
      const a = find(m.indices[t] ?? 0);
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  return parent.map((_, v) => find(v));
}

/**
 * Cards painted and shortened from their roots. `at` is the part's world offset (the frame the
 * paint and keep functions speak). Joints and weights pass through untouched.
 */
export function cardWear(cards: Mesh, o: CardWearOptions, at: Vec3 = [0, 0, 0]): Mesh {
  if (!o.paint && !o.keep) return cards;
  const P = cards.positions;
  const N = cards.normals;
  const C = cards.colors;
  const card = cardOf(cards);
  const n = card.length;
  const positions = o.keep ? new Float32Array(P) : P;
  const colors = o.paint ? new Float32Array(C) : C;
  // Per card: its root (local), world root, skin-side normal and kept share.
  const root = new Map<number, { r: Vec3; w: Vec3; n: Vec3; k: number }>();
  for (let v = 0; v < n; v++) {
    const id = card[v] ?? v;
    let rec = root.get(id);
    if (!rec) {
      const mid = (i: number): number =>
        ((P[id * 3 + i] ?? 0) + (P[id * 3 + 3 + i] ?? P[id * 3 + i] ?? 0)) / 2;
      const sum = (i: number): number => (N[id * 3 + i] ?? 0) + (N[id * 3 + 3 + i] ?? 0);
      const r: Vec3 = [mid(0), mid(1), mid(2)];
      const s: Vec3 = [sum(0), sum(1), sum(2)];
      const sl = dmath.hypot(s[0], s[1], s[2]);
      const nr: Vec3 = sl > 1e-9 ? [s[0] / sl, s[1] / sl, s[2] / sl] : [0, 0, 1];
      const w: Vec3 = [r[0] + at[0], r[1] + at[1], r[2] + at[2]];
      const k = o.keep ? o.keep(w, nr) : 1;
      if (!(k >= 0 && k <= 1))
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `cardWear: keep ${k} (outside 0..1) at [${w.map((x) => x.toFixed(3)).join(', ')}]`,
          fix: 'keep is the share of the card length kept, 0..1 (1 = untouched)',
        });
      rec = { r, w, n: nr, k };
      root.set(id, rec);
    }
    if (o.keep && rec.k < 1)
      for (let i = 0; i < 3; i++)
        positions[v * 3 + i] = (rec.r[i] ?? 0) + ((P[v * 3 + i] ?? 0) - (rec.r[i] ?? 0)) * rec.k;
    if (o.paint) {
      const c = o.paint(rec.w, rec.n, [C[v * 3] ?? 1, C[v * 3 + 1] ?? 1, C[v * 3 + 2] ?? 1]);
      // Linear 0..1 whatever the stain multiplies to (QA vertex-colors).
      for (let i = 0; i < 3; i++) colors[v * 3 + i] = Math.min(1, Math.max(0, c[i] ?? 0));
    }
  }
  return { ...cards, positions, colors };
}
