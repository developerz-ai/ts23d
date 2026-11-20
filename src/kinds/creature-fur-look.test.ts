// D59 "fur cards read as chips": the measurable causes, per card of the wolf coat. A card wider
// than ~½ its length squashes the ~11:1 atlas cell into a lozenge; a card darker than the coat
// it grows from reads as a scratch. Both fail on the pre-fix coat (median width/length 0.85 at
// LOD1, value 0.75 × the skin). Guards: the cards still lie down (≤ 25° mean) after the extra
// loft, and the coat costs no more triangles than before.

import { describe, expect, test } from 'bun:test';
import { createRng, dmath, type Mesh, type Vec3 } from '../core/index.ts';
import { bodyRes, creaturePlan } from './creature.ts';
import { bodyEdits } from './creature-body.ts';
import { creatureFur } from './creature-fur.ts';
import { sculptPiece } from './creature-mesh.ts';
import type { CreatureSpec } from './creature-spec.ts';

const WOLF: CreatureSpec = {
  skeleton: 'quadruped',
  family: 'canid',
  mass: 40,
  length: 1.15,
  height: 0.8,
  head: 0.265,
  neck: 0.28,
  tail: 0.42,
  surface: 'fur',
  coat: 0.03,
  colours: {
    coat: [0.32, 0.27, 0.2],
    nose: [0.01, 0.01, 0.01],
    iris: [0.6, 0.3, 0.05],
    keratin: [0.03, 0.02, 0.02],
  },
};

const { bones } = creaturePlan(WOLF);
const piece = sculptPiece({
  edits: bodyEdits(bones, WOLF, 1, bodyRes(bones) * 2.2, [0.1, 0.1, 0.1], [0.3, 0.3, 0.3]),
  res: bodyRes(bones) * 2.2,
  color: WOLF.colours.coat,
  mirror: bones.mirror,
});

/** Vertex ids of every card (connected component), ascending: the first two straddle the root. */
function cards(m: Mesh): number[][] {
  const n = m.positions.length / 3;
  const up = new Int32Array(n).map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while ((up[r] ?? r) !== r) r = up[r] ?? r;
    return r;
  };
  for (let t = 0; t < m.indices.length; t += 3)
    for (let k = 1; k < 3; k++) {
      const a = find(m.indices[t] ?? 0);
      const b = find(m.indices[t + k] ?? 0);
      if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
    }
  const out = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = out.get(r) ?? [];
    list.push(i);
    out.set(r, list);
  }
  return [...out.values()];
}

const at = (m: Mesh, i: number): Vec3 => [
  m.positions[i * 3] ?? 0,
  m.positions[i * 3 + 1] ?? 0,
  m.positions[i * 3 + 2] ?? 0,
];
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[xs.length >> 1] ?? 0;
const lum = (c: ArrayLike<number>, o = 0): number =>
  0.2126 * (c[o] ?? 0) + 0.7152 * (c[o + 1] ?? 0) + 0.0722 * (c[o + 2] ?? 0);

/** Per card: width ÷ length, value ÷ the coat at its root, mid-card height and lie angle. */
function survey(lod: 0 | 1) {
  const f = creatureFur(piece.mesh, bones, WOLF, {
    lod,
    rng: createRng(7),
    field: piece.field,
  });
  expect(f).not.toBeNull();
  const m: Mesh = f?.mesh ?? piece.mesh;
  const stride = m.colors.length / (m.positions.length / 3);
  const aspect: number[] = [];
  const value: number[] = [];
  const lie: number[] = [];
  for (const vs of cards(m)) {
    const [a, b] = [at(m, vs[0] ?? 0), at(m, vs[1] ?? 0)];
    const root: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const tip = at(m, vs[vs.length - 1] ?? 0);
    const len = dmath.hypot(tip[0] - root[0], tip[1] - root[1], tip[2] - root[2]);
    aspect.push(dmath.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / len);
    let v = 0;
    for (const i of vs) v += lum(m.colors, i * stride);
    value.push(v / vs.length / Math.max(1e-4, lum(piece.color(root))));
    const h = 1e-3;
    const g: Vec3 = [
      piece.field([root[0] + h, root[1], root[2]]) - piece.field([root[0] - h, root[1], root[2]]),
      piece.field([root[0], root[1] + h, root[2]]) - piece.field([root[0], root[1] - h, root[2]]),
      piece.field([root[0], root[1], root[2] + h]) - piece.field([root[0], root[1], root[2] - h]),
    ];
    const gl = dmath.norm(g) || 1;
    const up =
      ((tip[0] - root[0]) * g[0] + (tip[1] - root[1]) * g[1] + (tip[2] - root[2]) * g[2]) /
      (gl * len);
    lie.push((dmath.asin(Math.max(-1, Math.min(1, up))) * 180) / Math.PI);
  }
  return { aspect, value, lie, tris: m.indices.length / 3 };
}

describe('wolf fur cards read as fur, not chips', () => {
  const s0 = survey(0);
  const s1 = survey(1);

  test('fails on chips: cards are long and narrow (median width ≤ ½ the length) at LOD0 and LOD1', () => {
    expect(median(s0.aspect)).toBeLessThanOrEqual(0.5);
    expect(median(s1.aspect)).toBeLessThanOrEqual(0.5);
  });

  test('fails on dark scratches: a card carries at least the value of the coat it grows from', () => {
    expect(median(s0.value)).toBeGreaterThanOrEqual(0.95);
    expect(median(s1.value)).toBeGreaterThanOrEqual(0.95);
  });

  test('cards lie down along the coat: mean root → tip angle off the skin ≤ 25°', () => {
    for (const s of [s0, s1]) {
      expect(s.lie.reduce((t, x) => t + x, 0) / s.lie.length).toBeLessThanOrEqual(25);
    }
  });

  test('the LOD0 coat costs no more triangles than the pre-fix one on this body (15.8k)', () => {
    expect(s0.tris).toBeLessThanOrEqual(15816);
  });
});
