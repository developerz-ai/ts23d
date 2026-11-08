import { describe, expect, it } from 'bun:test';
import { createRng, triangleCount } from '../core/index.ts';
import { crownShade } from './vegetation-leaves.ts';
import { needleTufts } from './vegetation-needles.ts';
import { pine } from './vegetation-presets.ts';
import type { Stem } from './vegetation-skeleton.ts';

const twig: Stem = {
  level: 2,
  pts: [
    [0, 0, 5],
    [0.5, 0, 5.1],
    [1, 0, 5.2],
    [1.5, 0, 5.3],
  ],
  radii: [0.02, 0.016, 0.012, 0.008],
  length: 1.5,
  parent: 1,
  surface: [0, 0, 5],
  maxLength: 1.5,
};
const leaf = { ...pine.leaves, perStem: 1 };
const tufts = (stems: readonly Stem[], level = 2) =>
  needleTufts(stems, level, leaf, crownShade(stems, 0), createRng(3));

describe('needleTufts', () => {
  it('emits nothing for a level that has no stems', () => {
    expect(triangleCount(tufts([twig], 3))).toBe(0);
  });

  it('one tuft = two crossed double-sided brush cards whose spine runs through the twig axis', () => {
    const m = tufts([twig]);
    const n = m.normals;
    // Two cards × two sides; their facing normals are perpendicular (crossed, not stacked).
    const first: [number, number, number] = [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
    const half = n.length / 2;
    const second: [number, number, number] = [n[half] ?? 0, n[half + 1] ?? 0, n[half + 2] ?? 0];
    const dot = first[0] * second[0] + first[1] * second[1] + first[2] * second[2];
    expect(Math.abs(dot)).toBeLessThan(0.05);
    // Each card's spine (outline vertex 0 = base → vertex 7 = tip) passes through the twig axis
    // at the tuft's anchor (t = 0.35 + 0.65 / 2 → 2.025 segments along the polyline).
    const anchor = [1.0125, 0, 5.2025];
    const v = (i: number) => [
      m.positions[i * 3] ?? 0,
      m.positions[i * 3 + 1] ?? 0,
      m.positions[i * 3 + 2] ?? 0,
    ];
    const outline = 14;
    for (const card of [0, 2]) {
      const a = v(card * outline);
      const b = v(card * outline + 7);
      const ab = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
      const t =
        [0, 1, 2].reduce((s, k) => s + ((anchor[k] ?? 0) - (a[k] ?? 0)) * (ab[k] ?? 0), 0) /
        [0, 1, 2].reduce((s, k) => s + (ab[k] ?? 0) ** 2, 0);
      const d = Math.hypot(
        ...[0, 1, 2].map((k) => (a[k] ?? 0) + (ab[k] ?? 0) * t - (anchor[k] ?? 0)),
      );
      expect(d).toBeLessThan(0.012);
      expect(t).toBeGreaterThan(0.2);
      expect(t).toBeLessThan(0.5);
    }
    expect(triangleCount(m)).toBeGreaterThan(40);
  });
});
