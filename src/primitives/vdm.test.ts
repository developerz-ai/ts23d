import { describe, expect, it } from 'bun:test';
import { createRng, Ts23dError, type Vec3 } from '../core/index.ts';
import { openEdges } from './closed.ts';
import { type SculptEdit, sculpt, sculptField } from './sculpt.ts';
import { probeLipschitz } from './sculpt-stroke.ts';
import { compile, fold } from './sculpt-tree.ts';
import { shapes } from './sdf-ops.ts';
import { compileVdm, type SculptVdm, sampleStamp, vdmEdit, vdmStamp } from './vdm.ts';
import { poreField, scalePatch, wart } from './vdm-library.ts';

const SKIN: Vec3 = [0.6, 0.5, 0.4];
const BALL: SculptEdit = { shape: 'sphere', at: [0, 0, 0], size: 0.1 };
const ball = (p: Vec3): number => shapes.sphere(p[0], p[1], p[2], 0.1);

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** Radius of the surface along unit direction `dir` (bisection on the field). */
const radiusAlong = (f: (p: Vec3) => number, dir: Vec3): number => {
  let a = 0.05;
  let b = 0.2;
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2;
    if (f([dir[0] * m, dir[1] * m, dir[2] * m]) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
};

describe('vdm stamps', () => {
  it('the probe catches a stamp that under-declares its Lipschitz', () => {
    // Pores are steep (small pits), so the stamp's slope dominates the edit's declared cost.
    const honest = poreField({ seed: 3, count: 12 });
    const liar = { ...honest, lipschitz: honest.lipschitz * 0.1 };
    const place = { at: [0, 0, 0.1] as Vec3, normal: [0, 0, 1] as Vec3, scale: 0.08, depth: 0.004 };
    const box: [Vec3, Vec3] = [
      [-0.04, -0.04, 0.09],
      [0.04, 0.04, 0.105],
    ];
    const probe = (s: typeof honest, steps: number) => {
      const c = compileVdm(vdmEdit(s, place), 'test', false);
      return probeLipschitz((p) => c.apply(p, ball(p)), box, 1 + c.extra, steps);
    };
    expect(probe(liar, 48).ok).toBe(false);
    expect(probe(honest, 48).ok).toBe(true);
  });

  it('vdmStamp refuses a declared Lipschitz below the slope, a live edge and a bad grid', () => {
    const w = wart({ seed: 2 });
    expect(fails(() => vdmStamp(w.size, w.grid, w.lipschitz * 0.5)).code).toBe(
      'T3D_RECIPE_INVALID',
    );
    const edge = new Float32Array(w.grid);
    edge[2] = 0.1;
    expect(fails(() => vdmStamp(w.size, edge)).fix).toContain('border');
    expect(fails(() => vdmStamp(w.size, w.grid.subarray(3))).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => vdmStamp(2, new Float32Array(12))).code).toBe('T3D_RECIPE_INVALID');
    expect(vdmStamp(w.size, w.grid).lipschitz).toBeCloseTo(w.lipschitz, 9);
  });

  it('refuses a placement without a normal or with scale ≤ 0', () => {
    const w = wart();
    const bad = (place: SculptVdm['places'][number]) =>
      fails(() => compileVdm(vdmEdit(w, place), 'test', false));
    expect(bad({ at: [0, 0, 0.1], normal: [0, 0, 0], scale: 0.05 }).code).toBe(
      'T3D_RECIPE_INVALID',
    );
    expect(bad({ at: [0, 0, 0.1], normal: [0, 0, 1], scale: 0 }).code).toBe('T3D_RECIPE_INVALID');
    expect(fails(() => compileVdm({ vdm: w, places: [] }, 'test', false)).code).toBe(
      'T3D_RECIPE_INVALID',
    );
  });

  it('a wart raises a sphere by depth (± 5 %) at its centre and leaves it alone beyond its size', () => {
    const depth = 0.008;
    const edit = vdmEdit(wart({ seed: 5 }), {
      at: [0, 0, 0.1],
      normal: [0, 0, 1],
      scale: 0.06,
      depth,
    });
    const f = sculptField([BALL, edit], { color: SKIN }).field;
    const raise = radiusAlong(f, [0, 0, 1]) - 0.1;
    expect(Math.abs(raise - depth)).toBeLessThan(0.05 * depth);
    const rng = createRng(4);
    let checked = 0;
    for (let i = 0; i < 3000; i++) {
      const p: Vec3 = [rng.range(-0.15, 0.15), rng.range(-0.15, 0.15), rng.range(-0.15, 0.15)];
      // Outside the footprint (half-diagonal 0.06 / √2) in the stamp's tangent plane.
      if (Math.hypot(p[0], p[1]) <= 0.0425) continue;
      expect(f(p)).toBe(ball(p));
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('the sparse fold is bit-identical to the dense one with stamps', () => {
    const places = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = i * 0.9;
      const n: Vec3 = [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.6];
      return { at: [n[0] * 0.1, n[1] * 0.1, n[2] * 0.1] as Vec3, normal: n, scale: 0.05 };
    });
    const nodes = compile([BALL, { vdm: scalePatch({ seed: 2 }), places }], SKIN, true);
    const rng = createRng(9);
    for (let i = 0; i < 4000; i++) {
      const p: Vec3 = [rng.range(-0.14, 0.14), rng.range(-0.14, 0.14), rng.range(-0.14, 0.14)];
      expect(fold(nodes, p, null, SKIN, true)).toBe(fold(nodes, p, null, SKIN, false));
    }
  });

  it('mirror stamps both sides; up turns the stamp', () => {
    const place = {
      at: [0, 0.1, 0] as Vec3,
      normal: [0, 1, 0] as Vec3,
      up: [1, 0, 0] as Vec3,
      scale: 0.06,
    };
    const f = sculptField([BALL, { vdm: scalePatch(), places: [place], mirror: true }], {
      color: SKIN,
    }).field;
    const rng = createRng(1);
    for (let i = 0; i < 500; i++) {
      const p: Vec3 = [rng.range(-0.03, 0.03), rng.range(0.09, 0.12), rng.range(-0.03, 0.03)];
      expect(f([p[0], -p[1], p[2]])).toBe(f(p));
    }
    // Turning `up` by 90° about the normal turns the relief with it.
    const s = scalePatch();
    const a = compileVdm(vdmEdit(s, place), 't', false);
    const b = compileVdm(vdmEdit(s, { ...place, up: [0, 0, 1] }), 't', false);
    for (let i = 0; i < 300; i++) {
      const x = rng.range(-0.025, 0.025);
      const z = rng.range(-0.025, 0.025);
      // a: v along +X, u along +Z; b: v along +Z, u along −X — so a at (x, z) is b at (−z, x).
      const va = a.apply([x, 0.1, z], 0);
      const vb = b.apply([-z, 0.1, x], 0);
      expect(vb).toBeCloseTo(va, 9);
    }
  });

  it('meshes closed with stamps on, and the stamp samples bilinearly', () => {
    const edit = vdmEdit(wart(), { at: [0.1, 0, 0], normal: [1, 0, 0], scale: 0.05, depth: 0.006 });
    const m = sculpt({ edits: [BALL, edit], resolution: 0.006, color: SKIN });
    expect(openEdges(m)).toBe(0);
    const out = new Float64Array(3);
    sampleStamp(wart(), 0, 0, out);
    expect(out[2]).toBeCloseTo(1, 6);
    sampleStamp(wart(), 0.6, 0, out);
    expect([...out]).toEqual([0, 0, 0]);
  });
});
