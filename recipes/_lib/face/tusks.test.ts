import { describe, expect, it } from 'bun:test';
import { dmath, type Vec3 } from '@developerz.ai/ts23d';
import { ivoryTusk } from './tusks.ts';

/** A straight tusk up +Z, 8 cm, root radius 1 cm. */
const path: Vec3[] = Array.from({ length: 15 }, (_, i) => [0, 0, (0.08 * i) / 14]);
const R = 0.01;

/** The broken end's profile: per angular sector round the axis, the highest point of the
 *  tusk's surface there; returns max − min across the sectors (0: a flat cut). */
function endRelief(keep: number): number {
  const m = ivoryTusk(path, { radius: R, gum: 1 / 3, seg: 14, keep });
  const top = new Array(12).fill(Number.NEGATIVE_INFINITY);
  for (let v = 0; v < m.positions.length; v += 3) {
    const x = m.positions[v] ?? 0;
    const y = m.positions[v + 1] ?? 0;
    if (dmath.hypot(x, y) < 0.3 * R) continue;
    const s = Math.floor(((dmath.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 12) % 12;
    top[s] = Math.max(top[s], m.positions[v + 2] ?? 0);
  }
  return Math.max(...top) - Math.min(...top);
}

/** Luminance of the tusk's flank (not its caps) at height `z`, as the faces interpolate it: the
 *  mean of each ring of vertices, linear between the rings either side of `z`. */
function lumAt(m: { positions: Float32Array; colors: Float32Array }, z: number): number {
  const rings = new Map<number, { sum: number; n: number }>();
  for (let v = 0; v < m.positions.length; v += 3) {
    const x = m.positions[v] ?? 0;
    const y = m.positions[v + 1] ?? 0;
    if (dmath.hypot(x, y) < 0.3 * R) continue;
    const key = Math.round((m.positions[v + 2] ?? 0) * 1e5);
    const r = rings.get(key) ?? { sum: 0, n: 0 };
    r.sum += ((m.colors[v] ?? 0) + (m.colors[v + 1] ?? 0) + (m.colors[v + 2] ?? 0)) / 3;
    r.n++;
    rings.set(key, r);
  }
  const zs = [...rings.keys()].sort((a, b) => a - b).map((k) => k / 1e5);
  const at = (k: number): number => {
    const r = rings.get(Math.round(k * 1e5));
    return r ? r.sum / r.n : Number.NaN;
  };
  const hi = zs.findIndex((k) => k >= z);
  const b = zs[hi] ?? Number.NaN;
  const a = zs[hi - 1] ?? b;
  return b === a ? at(b) : at(a) + ((at(b) - at(a)) * (z - a)) / (b - a);
}

describe('orc tusk ivory (D526)', () => {
  const m = ivoryTusk(path, { radius: R, gum: 1 / 3, seg: 14 });
  const gum = 0.08 / 3;
  const lum = (c: Vec3): number => (c[0] + c[1] + c[2]) / 3;
  const ivory = lum([0.66, 0.55, 0.3]);

  it('fails if the gum stain is a wide band: 1.2 cm past the gum the tusk is ivory again', () => {
    expect(lumAt(m, gum + 0.012)).toBeGreaterThan(0.75 * ivory);
  });

  it('keeps a dark grime line right at the gum', () => {
    expect(lumAt(m, gum + 0.001)).toBeLessThan(0.5 * ivory);
  });

  it('grades the grime into the ivory over millimetres (a ring part-way, not a hard edge)', () => {
    const lo = lumAt(m, gum + 0.001);
    const hi = lumAt(m, gum + 0.012);
    const mids = [3, 4, 5, 6, 7, 8].map((mm) => (lumAt(m, gum + mm / 1000) - lo) / (hi - lo));
    expect(mids.filter((k) => k > 0.2 && k < 0.8).length).toBeGreaterThanOrEqual(2);
  });

  it('has its own value gradient: a darker yellowed root, a paler worn tip', () => {
    expect(lumAt(m, 0.064)).toBeGreaterThan(lumAt(m, gum + 0.012) * 1.1);
  });
});

describe('orc tusk ends (D524)', () => {
  it('fails if a snapped tusk ends in a clean cut: its broken end is jagged by ⅓ of its radius', () => {
    expect(endRelief(0.6)).toBeGreaterThan(R * 0.3);
  });

  it('a whole tusk tapers to a round point (no fracture)', () => {
    expect(endRelief(1)).toBeLessThan(R * 0.1);
  });
});
