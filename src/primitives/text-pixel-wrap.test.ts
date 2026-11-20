import { describe, expect, it } from 'bun:test';
import { dmath, type Mesh } from '../core/index.ts';
import { type TextOptions, text } from './text.ts';
import { mergeRisers, risers } from './text-pixel-wrap.ts';
import { boxcarSideLettering } from './text-wrap-fixtures.ts';

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
    for (const y of s.ys) expect(y <= 0.2 + 1e-9 || y >= 0.3 - 1e-9).toBe(true);
    // From the lower decal (2 mm) to the higher one (72 mm): no gap left to see through.
    const xs = Array.from(m.positions).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs)).toBeCloseTo(0.002, 6);
    expect(Math.max(...xs)).toBeCloseTo(0.072, 6);
  });

  it('fails before D407: each riser meets the higher paint along its edge and stands on the lower', () => {
    const m = sign('HHH', { surface: post, wrap: true });
    const P = (i: number): number[] => [0, 1, 2].map((k) => m.positions[i * 3 + k] ?? 0);
    const tris = Array.from({ length: m.indices.length / 3 }, (_, t) =>
      [0, 1, 2].map((k) => P(m.indices[t * 3 + k] ?? 0)),
    );
    const inPlane = (x: number) =>
      tris.filter((c) => c.every((p) => Math.abs((p[0] ?? 0) - x) < 1e-6));
    // (y, z) of q on the segment a–b, or inside triangle c, within a micron (float32 positions).
    const onSeg = (q: number[], a: number[], b: number[]): boolean => {
      const [ay = 0, az = 0] = [a[1], a[2]];
      const [dy, dz] = [(b[1] ?? 0) - ay, (b[2] ?? 0) - az];
      const t = (((q[1] ?? 0) - ay) * dy + ((q[2] ?? 0) - az) * dz) / (dy * dy + dz * dz);
      return (
        t >= -1e-6 &&
        t <= 1 + 1e-6 &&
        dmath.hypot(ay + dy * t - (q[1] ?? 0), az + dz * t - (q[2] ?? 0)) < 1e-6
      );
    };
    const inside = (q: number[], c: number[][]): boolean => {
      const s = [0, 1, 2].map((k) => {
        const a = c[k] ?? [];
        const b = c[(k + 1) % 3] ?? [];
        return (
          ((b[1] ?? 0) - (a[1] ?? 0)) * ((q[2] ?? 0) - (a[2] ?? 0)) -
          ((b[2] ?? 0) - (a[2] ?? 0)) * ((q[1] ?? 0) - (a[1] ?? 0))
        );
      });
      return s.every((v) => v >= -1e-9) || s.every((v) => v <= 1e-9);
    };
    const high = inPlane(0.072);
    const low = inPlane(0.002);
    const risersSeen = tris.filter((c) => {
      const xs = c.map((p) => p[0] ?? 0);
      return Math.max(...xs) - Math.min(...xs) > 0.03;
    });
    expect(risersSeen.length).toBeGreaterThan(0);
    for (const c of risersSeen)
      for (const q of c)
        if ((q[0] ?? 0) > 0.037)
          // Top: on an edge of the higher paint (shared line, no slit).
          expect(
            high.some((h) => [0, 1, 2].some((k) => onSeg(q, h[k] ?? [], h[(k + 1) % 3] ?? []))),
          ).toBe(true);
        // Foot: on the lower paint, so nothing shows between them either.
        else expect(low.some((l) => inside(q, l))).toBe(true);
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

  it('fails before D456: wrapping a boxcar side costs ≤ 1.3× the flat stencils, nothing at LOD2', () => {
    const tris = (lod: 0 | 1 | 2, wrap: boolean): number =>
      boxcarSideLettering(lod, wrap).indices.length / 3;
    for (const lod of [0, 1] as const)
      expect(tris(lod, true)).toBeLessThanOrEqual(tris(lod, false) * 1.3);
    expect(tris(2, true)).toBe(tris(2, false));
  });

  it('merges risers that continue one another along the same step into one', () => {
    const r = { axis: 'u', at: 1, w0: 0.002, w1: 0.072, out: -1 } as const;
    expect(
      mergeRisers([
        { ...r, a0: 0.2, a1: 0.3 },
        { ...r, a0: 0, a1: 0.1 },
        { ...r, a0: 0.1, a1: 0.2 },
        { ...r, a0: 0.5, a1: 0.6 },
        { ...r, a0: 0.6, a1: 0.7, w1: 0.036 },
      ]),
    ).toEqual([
      { ...r, a0: 0, a1: 0.3 },
      { ...r, a0: 0.5, a1: 0.6 },
      { ...r, a0: 0.6, a1: 0.7, w1: 0.036 },
    ]);
  });
});
