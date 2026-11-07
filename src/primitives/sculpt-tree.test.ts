import { describe, expect, it } from 'bun:test';
import { boundsOf, createRng, type Mesh, Ts23dError, type Vec3 } from '../core/index.ts';
import { openEdges } from './closed.ts';
import { type SculptEdit, sculpt } from './sculpt.ts';
import { compile, fold } from './sculpt-tree.ts';

const SKIN: Vec3 = [0.4, 0.6, 0.3];
const RED: Vec3 = [0.9, 0.1, 0.1];

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

/** A busy sculpt: every shape and op, blends, rotations, mirror overrides, nested groups. */
const BUSY: SculptEdit[] = [
  { shape: 'ellipsoid', at: [0, 0, 0.12], size: [0.09, 0.08, 0.11] },
  { shape: 'ellipsoid', at: [0.04, 0, 0.06], size: [0.07, 0.075, 0.05], blend: 0.03 },
  {
    shape: 'roundBox',
    at: [0.07, 0.03, 0.15],
    size: [0.04, 0.05, 0.02],
    round: 0.005,
    rotate: [0, 20, 10],
    blend: 0.01,
  },
  {
    shape: 'sphere',
    at: [0.07, 0.03, 0.125],
    size: 0.018,
    op: 'subtract',
    blend: 0.008,
    color: RED,
  },
  {
    group: [
      { shape: 'sphere', at: [0.064, 0.03, 0.125], size: 0.016 },
      { shape: 'roundBox', at: [0.064, 0.03, 0.105], size: [0.05, 0.05, 0.04], op: 'subtract' },
    ],
    blend: 0.003,
    color: [0.9, 0.85, 0.7],
  },
  {
    shape: 'cone',
    at: [0.09, 0, 0.09],
    size: [0.022, 0.008, 0.04],
    rotate: [0, 70, 0],
    blend: 0.012,
  },
  {
    shape: 'capsule',
    at: [0.106, -0.028, 0.05],
    to: [0.106, 0.028, 0.05],
    size: 0.009,
    op: 'subtract',
    blend: 0.006,
  },
  { shape: 'torus', at: [0.0, 0.0, 0.24], size: [0.03, 0.006], blend: 0.004, mirror: false },
  { shape: 'sphere', at: [0.077, 0.03, 0.127], size: 0.006, op: 'paint', blend: 0.002, color: RED },
  { shape: 'ellipsoid', at: [0, 0, 0.1], size: [0.12, 0.12, 0.2], op: 'intersect', blend: 0.01 },
];

describe('sculpt tree', () => {
  it('throws T3D_RECIPE_INVALID with a fix for a group with nothing to carve from', () => {
    const e = fails(() =>
      sculpt({
        edits: [
          { shape: 'sphere', at: [0, 0, 0], size: 0.1 },
          { group: [{ shape: 'sphere', at: [0, 0, 0], size: 0.05, op: 'subtract' }] },
        ],
        resolution: 0.02,
        color: SKIN,
      }),
    );
    expect(e.code).toBe('T3D_RECIPE_INVALID');
    expect(e.message).toContain('group 1');
    expect(e.fix).toContain("op: 'add'");
  });

  it('sparse evaluation is bit-identical to evaluating every edit (distance and colour)', () => {
    const nodes = compile(BUSY, SKIN, true);
    const rng = createRng(4);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    for (let i = 0; i < 20000; i++) {
      const p: Vec3 = [rng.range(-0.15, 0.2), rng.range(-0.15, 0.15), rng.range(-0.05, 0.3)];
      expect(fold(nodes, p, null, SKIN, true)).toBe(fold(nodes, p, null, SKIN, false));
      fold(nodes, p, a, SKIN, true);
      fold(nodes, p, b, SKIN, false);
      expect([...a]).toEqual([...b]);
    }
  });

  it('a group trims only its own shapes', () => {
    const body: SculptEdit = { shape: 'sphere', at: [0, 0, 0.1], size: 0.1 };
    const lid: SculptEdit = { shape: 'sphere', at: [0.1, 0, 0.1], size: 0.05 };
    const cut: SculptEdit = {
      shape: 'roundBox',
      at: [0.1, 0, 0.2],
      size: [0.4, 0.4, 0.2],
      op: 'subtract',
    };
    const grouped = sculpt({ edits: [body, { group: [lid, cut] }], resolution: 0.01, color: SKIN });
    const flat = sculpt({ edits: [body, lid, cut], resolution: 0.01, color: SKIN });
    // Grouped: the body keeps its top (z 0.2); only the lid lost its upper half.
    expect(boundsOf(grouped).max[2]).toBeGreaterThan(0.19);
    expect(boundsOf(grouped).max[0]).toBeGreaterThan(0.14);
    const lidTop = (m: Mesh): number => {
      let top = 0;
      for (let i = 0; i < m.positions.length; i += 3)
        if ((m.positions[i] ?? 0) > 0.12) top = Math.max(top, m.positions[i + 2] ?? 0);
      return top;
    };
    expect(lidTop(grouped)).toBeLessThan(0.115);
    // Flat list: the same subtract also slices the body's top off.
    expect(boundsOf(flat).max[2]).toBeLessThan(0.11);
    expect(openEdges(grouped)).toBe(0);
  });

  it("mirror 'y' snaps the grid: the mesh is its own mirror image", () => {
    const m = sculpt({ edits: BUSY, resolution: 0.006, color: SKIN, mirror: 'y' });
    const key = (x: number, y: number, z: number): string =>
      `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    const set = new Set<string>();
    for (let i = 0; i < m.positions.length; i += 3)
      set.add(key(m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0));
    let missing = 0;
    for (let i = 0; i < m.positions.length; i += 3)
      if (!set.has(key(m.positions[i] ?? 0, -(m.positions[i + 1] ?? 0), m.positions[i + 2] ?? 0)))
        missing++;
    // The torus opts out of the mirror but sits on y = 0, so the whole sculpt is symmetric.
    expect(missing).toBe(0);
  });
});
