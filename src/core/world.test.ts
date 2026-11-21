import { describe, expect, it } from 'bun:test';
import type { Part } from './asset.ts';
import { transformOf, worldTransforms } from './world.ts';

const part = (name: string, parent: string | null, at: [number, number, number], yaw: number) =>
  ({ name, parent, at, yaw, mesh: null, motion: null }) as Part;

describe('transformOf', () => {
  const parts = [
    part('root', null, [1, 0, 0], 0.5),
    part('arm', 'root', [0, 2, 0], 0.25),
    part('hand', 'arm', [0.5, 0, 1], -1),
    part('other', null, [9, 9, 9], 2),
  ];
  const byName = new Map(parts.map((p) => [p.name, p]));

  it('matches worldTransforms for every node, walking only its own ancestors', () => {
    const all = worldTransforms(parts);
    for (const p of parts) {
      const t = transformOf(byName, p.name);
      const w = all.get(p.name);
      expect(t.yaw).toBeCloseTo(w?.yaw ?? Number.NaN, 12);
      for (let i = 0; i < 3; i++) expect(t.origin[i]).toBeCloseTo(w?.origin[i] ?? Number.NaN, 12);
    }
  });

  it('is the identity for an unknown name', () => {
    expect(transformOf(byName, 'nope')).toEqual({ origin: [0, 0, 0], yaw: 0 });
  });
});
