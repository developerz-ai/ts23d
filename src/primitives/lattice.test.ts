import { describe, expect, it } from 'bun:test';
import { boundsOf, type Mesh, Ts23dError, triangleCount } from '../core/index.ts';
import { stripRect } from '../material/index.ts';
import { type LatticeOptions, lattice, type TrussPattern, webMembers } from './lattice.ts';

const C = [0.3, 0.3, 0.32] as const;

const fails = (f: () => unknown): Ts23dError => {
  try {
    f();
  } catch (e) {
    if (e instanceof Ts23dError) return e;
    throw e;
  }
  throw new Error('expected a Ts23dError');
};

const truss = (extra: Partial<LatticeOptions> = {}): Mesh =>
  lattice({ from: [0, 0, 0], to: [12, 0, 0], depth: 2, chord: 0.2, color: C, ...extra });

const webCount = (p: TrussPattern, k: number): number =>
  p === 'warren' ? k : p === 'x' ? 3 * k + 1 : 2 * k + 1 + (k % 2);

describe('lattice', () => {
  it('throws T3D_RECIPE_INVALID with a fix on degenerate input', () => {
    const same = fails(() => truss({ to: [0, 0, 0] }));
    expect(same.code).toBe('T3D_RECIPE_INVALID');
    expect(same.fix).toContain('distinct');
    expect(fails(() => truss({ chord: 3 })).fix).toContain('thinner');
    expect(fails(() => truss({ bays: 0 })).fix).toContain('whole number');
    expect(fails(() => truss({ up: [1, 0, 0] })).fix).toContain('perpendicular');
    expect(fails(() => truss({ depth: -1 })).code).toBe('T3D_RECIPE_INVALID');
  });

  it('counts web members per pattern', () => {
    for (const p of ['warren', 'pratt', 'howe', 'x'] as const)
      for (const k of [1, 2, 5, 6]) expect(webMembers(p, k)).toHaveLength(webCount(p, k));
  });

  it('triangles follow chords·(S+C) + faces·web·S for every pattern, section and shape', () => {
    for (const pattern of ['warren', 'pratt', 'howe', 'x'] as const)
      for (const [sectionKind, S, Cap] of [
        ['square', 8, 4],
        ['angle', 12, 8],
      ] as const)
        for (const width of [undefined, 1.5]) {
          const k = 5;
          const chords = width ? 4 : 2;
          const faces = width ? 4 : 1;
          const m = truss({ pattern, section: sectionKind, bays: k, ...(width ? { width } : {}) });
          expect(triangleCount(m)).toBe(chords * (S + Cap) + faces * webCount(pattern, k) * S);
        }
  });

  it('bays is the LOD knob: fewer bays, fewer triangles', () => {
    expect(triangleCount(truss({ bays: 3 }))).toBeLessThan(triangleCount(truss({ bays: 12 })));
  });

  it('spans from → to, rises along up, box truss centred across', () => {
    const b = boundsOf(truss({ width: 1.5 }));
    // Web members are centred on the end nodes, so they may overhang by < web / 2 (0.06 m).
    expect(b.min[0]).toBeGreaterThan(-0.06);
    expect(b.min[0]).toBeLessThanOrEqual(0);
    expect(b.max[0]).toBeLessThan(12.06);
    expect(b.max[0]).toBeGreaterThanOrEqual(12);
    expect(b.max[2]).toBeCloseTo(2.1, 5);
    expect(b.min[2]).toBeCloseTo(-0.1, 5);
    expect(b.max[1]).toBeCloseTo(0.85, 5);
    const c = boundsOf(truss({ centred: true, up: [0, 1, 0] }));
    expect(c.max[1]).toBeCloseTo(1.1, 5);
    expect(c.min[1]).toBeCloseTo(-1.1, 5);
    // A taper narrows the far end.
    const tower = boundsOf(
      truss({
        from: [0, 0, 0],
        to: [0, 0, 20],
        width: 4,
        widthEnd: 1,
        depth: 4,
        depthEnd: 1,
        centred: true,
      }),
    );
    expect(tower.max[2]).toBeGreaterThanOrEqual(20);
    expect(tower.max[2]).toBeLessThan(20.06);
    expect(tower.max[1]).toBeCloseTo(2.1, 2); // tilted chords shift the corner slightly
  });

  it('normals point out of each member', () => {
    // A single chord pair, no web worth checking: warren k=1 has one diagonal.
    const m = truss({ bays: 1, pattern: 'warren' });
    // First chord runs along X at z = 0: every side normal points away from its axis.
    for (let v = 0; v < 16; v++) {
      const y = m.positions[v * 3 + 1] ?? 0;
      const z = m.positions[v * 3 + 2] ?? 0;
      expect(y * (m.normals[v * 3 + 1] ?? 0) + z * (m.normals[v * 3 + 2] ?? 0)).toBeGreaterThan(0);
    }
  });

  it('keeps V on the iron strip and is deterministic', () => {
    const r = stripRect('iron');
    const m = truss({ pattern: 'pratt', section: 'angle', width: 1 });
    for (let i = 1; i < m.uvs.length; i += 2) {
      expect(m.uvs[i] ?? 0).toBeGreaterThan(r.v0);
      expect(m.uvs[i] ?? 1).toBeLessThan(r.v1);
    }
    expect(m).toEqual(truss({ pattern: 'pratt', section: 'angle', width: 1 }));
  });
});
