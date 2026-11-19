import { describe, expect, it } from 'bun:test';
import type { Mesh } from '../core/index.ts';
import { type TextOptions, text } from './text.ts';
import { risers } from './text-pixel-wrap.ts';

const sign = (s: string, o: Partial<TextOptions> = {}): Mesh =>
  text(s, { origin: [0, 0, 0], height: 0.7, color: [1, 1, 1], ...o });
// A post 0.07 m proud between u = 0.2 and 0.3 (the text faces +X, reads along +Y).
const post = (u: number): number => (u > 0.2 && u < 0.3 ? 0.07 : 0);

/** Triangles whose x extent covers the step (riser faces), with their geometric normal's y. */
function stepFaces(m: Mesh): { count: number; agree: boolean; ys: number[] } {
  let count = 0;
  let agree = true;
  const ys: number[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => {
      const i = (m.indices[t + k] ?? 0) * 3;
      return [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0];
    }) as [number[], number[], number[]];
    const xs = [a[0] ?? 0, b[0] ?? 0, c[0] ?? 0];
    if (Math.max(...xs) - Math.min(...xs) < 0.03) continue;
    count++;
    const e = [0, 1, 2].map((k) => (b[k] ?? 0) - (a[k] ?? 0));
    const f = [0, 1, 2].map((k) => (c[k] ?? 0) - (a[k] ?? 0));
    const gy = (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0);
    const ny = m.normals[(m.indices[t] ?? 0) * 3 + 1] ?? 0;
    if (gy * ny <= 0) agree = false;
    ys.push(a[1] ?? 0);
  }
  return { count, agree, ys };
}

describe('text wrap', () => {
  it('without wrap nothing covers the side of a proud post (the chopped lettering)', () => {
    expect(stepFaces(sign('HHH', { surface: post })).count).toBe(0);
  });

  it('wrap paints the step between pieces at different depths, facing the lower side', () => {
    const m = sign('HHH', { surface: post, wrap: true });
    const s = stepFaces(m);
    expect(s.count).toBeGreaterThanOrEqual(4);
    expect(s.agree).toBe(true);
    // Risers stand 2 mm clear of the pixel column edges that bound the post, never inside it.
    for (const y of s.ys) expect(y < 0.2 || y > 0.3).toBe(true);
    // From the lower decal (2 mm) to the higher one (72 mm): no gap left to see through.
    const xs = Array.from(m.positions).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0.002, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.072, 6);
  });

  it('keeps the default bytes: wrap off, or on with no surface or no step', () => {
    expect(sign('HHH', { surface: post, wrap: false })).toEqual(sign('HHH', { surface: post }));
    expect(sign('HHH', { wrap: true })).toEqual(sign('HHH'));
    expect(sign('HHH', { surface: () => 0.03, wrap: true })).toEqual(
      sign('HHH', { surface: () => 0.03 }),
    );
  });

  it('wraps a step across the letter height too (a rail under the lettering)', () => {
    const rail = (_u: number, v: number): number => (v > 0.25 && v < 0.45 ? 0.05 : 0);
    const off = sign('I', { surface: rail });
    const on = sign('I', { surface: rail, wrap: true });
    expect(on.indices.length).toBeGreaterThan(off.indices.length);
    const up = Array.from(on.normals).filter((_, i) => i % 3 === 2);
    expect(up.some((z) => z > 0.99) && up.some((z) => z < -0.99)).toBe(true);
  });

  it('raised letters: the riser runs from the lower top to the higher foot, none when they overlap', () => {
    const a = { u0: 0, u1: 1, v0: 0, v1: 1, s: 0 };
    const b = { u0: 1, u1: 2, v0: 0.5, v1: 2, s: 0.07 };
    expect(risers([a, b], 0.01, 0)).toEqual([
      { axis: 'u', at: 1, a0: 0.5, a1: 1, w0: 0.01, w1: 0.07, out: -1 },
    ]);
    expect(risers([a, b], 0.08, 0)).toEqual([]);
    // Pieces that only meet at a corner, or do not touch, share no step.
    expect(risers([a, { ...b, v0: 1 }], 0.002, 0.002)).toEqual([]);
    expect(risers([a, { ...b, u0: 1.5 }], 0.002, 0.002)).toEqual([]);
  });
});
