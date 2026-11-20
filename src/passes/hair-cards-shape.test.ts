// Card shape: folded V sections, hue toward the tip, no kinks or twists along long cards, lying on
// the skin where it holds hair up, shading normals that agree with the faces.

import { describe, expect, test } from 'bun:test';
import type { Vec3 } from '../core/index.ts';
import { dmath } from '../core/index.ts';
import { at, field, R, run, zone } from './hair-fixtures.ts';

describe('hairCards shape', () => {
  test('fails if a folded card is a flat ribbon: its centre line stands proud of its edges', () => {
    const flat = run({ zones: [zone({ fold: 0 })] }).mesh;
    const v = run({ zones: [zone({ fold: 0.6, roll: 0 })] }).mesh;
    // Folded: 3 vertices per row (4 tris per segment), so twice the triangles of a flat card.
    expect(v.indices.length).toBe(flat.indices.length * 2);
    // Row 1 of the first card: left, right, centre. The centre sits further from the axis.
    const r = (i: number): number => dmath.hypot(at(v, i)[1], at(v, i)[2]);
    const lift = r(5) - (r(3) + r(4)) / 2;
    expect(lift).toBeGreaterThan(0.012 * 0.5 * 0.6 * 0.5);
    // Roots still straddled by vertices 0 and 1: their midpoint is buried.
    expect(
      field([0, (at(v, 0)[1] + at(v, 1)[1]) / 2, (at(v, 0)[2] + at(v, 1)[2]) / 2]),
    ).toBeLessThan(0);
  });

  test('fails if the tip tint is ignored: the hue shifts root → tip, not just the value', () => {
    const m = run({ zones: [zone({ tint: [1.2, 1, 0.7], tone: [1, 1], jitter: 0 })] }).mesh;
    const segs = 3;
    const c = (i: number): Vec3 => [
      m.colors[i * 3] ?? 0,
      m.colors[i * 3 + 1] ?? 0,
      m.colors[i * 3 + 2] ?? 0,
    ];
    const root = c(0);
    const tip = c(segs * 2);
    expect(tip[0] / tip[2]).toBeGreaterThan((root[0] / root[2]) * 1.5);
  });

  test('fails if long cards kink: over a rippled skin and a lumpy solid they turn < 40° a segment', () => {
    const rippled = (p: Vec3): number =>
      dmath.hypot(p[1], p[2]) - R + 0.03 * dmath.sin(p[0] * 60) * dmath.sin(p[2] * 60);
    const collide = (p: Vec3): number =>
      dmath.hypot(p[1], p[2]) - R - 0.02 - 0.02 * Math.max(0, dmath.sin(p[0] * 21));
    const m = run({
      zones: [zone({ length: 0.3, droop: 0.6, lift: 0.1, roll: 0, clump: 4, density: () => 60 })],
      segments: 8,
      field: rippled,
      collide,
    }).mesh;
    const rows = 9;
    const cards = m.positions.length / 3 / (rows * 2);
    let worst = 0;
    for (let c = 0; c < cards; c++) {
      const mid = (k: number): Vec3 => {
        const a = at(m, c * rows * 2 + k * 2);
        const b = at(m, c * rows * 2 + k * 2 + 1);
        return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      };
      for (let k = 2; k < rows - 1; k++) {
        const p = mid(k - 1);
        const q = mid(k);
        const r = mid(k + 1);
        const u: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
        const v: Vec3 = [r[0] - q[0], r[1] - q[1], r[2] - q[2]];
        const cos =
          (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) /
          (dmath.hypot(u[0], u[1], u[2]) * dmath.hypot(v[0], v[1], v[2]) || 1);
        worst = Math.max(worst, (dmath.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI);
      }
    }
    expect(cards).toBeGreaterThan(5);
    expect(worst).toBeLessThan(40);
  });

  test('fails if hugging cards stand off the skin where it holds them up; underneath they hang', () => {
    const tips = (hug: number): { top: number; under: number } => {
      const m = run({ zones: [zone({ lift: 0.6, bend: 0, droop: 0, hug })], segments: 4 }).mesh;
      const rows = 5;
      const cols = 2;
      let top = 0;
      let under = 0;
      for (let c = 0; c < m.positions.length / 3 / (rows * cols); c++) {
        const root = at(m, c * rows * cols);
        const tip = at(m, c * rows * cols + (rows - 1) * cols);
        const off = field(tip);
        if (root[2] > R * 0.8) top = Math.max(top, off);
        if (root[2] < -R * 0.8) under = Math.max(under, off);
      }
      return { top, under };
    };
    const free = tips(0);
    const lying = tips(1);
    expect(lying.top).toBeLessThan(free.top * 0.35);
    // The underside cannot hold hair up: hugging changes nothing there.
    expect(lying.under).toBeGreaterThan(free.under * 0.9);
  });

  test('fails if a card flips edge-on along its length: its width turns < 120° row to row', () => {
    // Long cards over a rippled solid: the field's normal swings from row to row along them.
    const rippled = (p: Vec3): number =>
      dmath.hypot(p[1], p[2]) - R + 0.03 * dmath.sin(p[0] * 60) * dmath.sin(p[2] * 60);
    const m = run({
      zones: [zone({ length: 0.4, lift: 0.5, bend: 0, droop: 0.9, roll: 0 })],
      segments: 8,
      field: rippled,
    }).mesh;
    const rows = 9;
    let worst = 0;
    for (let c = 0; c < m.positions.length / 3 / (rows * 2); c++)
      for (let k = 1; k < rows; k++) {
        const w = (r: number): Vec3 => {
          const a = at(m, c * rows * 2 + r * 2);
          const b = at(m, c * rows * 2 + r * 2 + 1);
          const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const l = dmath.hypot(d[0], d[1], d[2]) || 1;
          return [d[0] / l, d[1] / l, d[2] / l];
        };
        const u = w(k - 1);
        const v = w(k);
        const cos = Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]);
        worst = Math.max(worst, (dmath.acos(cos) * 180) / Math.PI);
      }
    // Re-deriving the width from each row's skin normal flips the ribbon (180°) here.
    expect(worst).toBeLessThan(120);
  });

  test('fails if shading normals oppose the faces (QA normals-winding): rolled cards hanging off', () => {
    const rippled = (p: Vec3): number =>
      dmath.hypot(p[1], p[2]) - R + 0.03 * dmath.sin(p[0] * 60) * dmath.sin(p[2] * 60);
    const m = run({
      zones: [zone({ length: 0.3, lift: 0.5, droop: 0.9, roll: 1.5, width: 0.05 })],
      segments: 4,
      field: rippled,
    }).mesh;
    let bad = 0;
    let all = 0;
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = m.indices[t] ?? 0;
      const b = m.indices[t + 1] ?? 0;
      const c = m.indices[t + 2] ?? 0;
      const e1 = at(m, b).map((v, k) => v - (at(m, a)[k] ?? 0));
      const e2 = at(m, c).map((v, k) => v - (at(m, a)[k] ?? 0));
      const f: Vec3 = [
        (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
        (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
        (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
      ];
      // The QA gate's measure: the mean of the three vertex normals against the face (> ~95°).
      const nm = (k: number): number =>
        (m.normals[a * 3 + k] ?? 0) + (m.normals[b * 3 + k] ?? 0) + (m.normals[c * 3 + k] ?? 0);
      const n: Vec3 = [nm(0), nm(1), nm(2)];
      const cos =
        (n[0] * f[0] + n[1] * f[1] + n[2] * f[2]) /
        (dmath.hypot(f[0], f[1], f[2]) * dmath.hypot(n[0], n[1], n[2]) || 1);
      const area = dmath.hypot(f[0], f[1], f[2]);
      all += area;
      if (cos < -0.1) bad += area;
    }
    // The gate allows 1 % of a part's area; cards stay well inside it.
    expect(bad / all).toBeLessThan(0.0025);
  });
});
