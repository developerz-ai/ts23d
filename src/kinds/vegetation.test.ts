import { describe, expect, it } from 'bun:test';
import {
  boundsOf,
  compile,
  createRng,
  defineAsset,
  dmath,
  type Lod,
  Ts23dError,
  triangleCount,
  worldMeshes,
} from '../core/index.ts';
import { measures, runQa } from '../qa/index.ts';
import { type TreeOptions, tree, treeReal, trees } from './vegetation.ts';
import { rootsMesh } from './vegetation-mesh.ts';
import { oak, SPECIES } from './vegetation-presets.ts';
import { grow } from './vegetation-skeleton.ts';

const asset = (o: TreeOptions, name = 'tree') =>
  defineAsset({
    name,
    kind: 'vegetation',
    budget: { triangles: [25000, 6000, 300] },
    build: (ctx) => {
      tree(ctx, o);
    },
  });

const tris = (o: TreeOptions, lod: Lod): number =>
  compile(asset(o), { lod }).parts.reduce((s, p) => s + (p.mesh ? triangleCount(p.mesh) : 0), 0);

describe('tree', () => {
  it('throws T3D_RECIPE_INVALID with a fix on an unknown species or a zero height', () => {
    const bad = (o: TreeOptions): Ts23dError => {
      try {
        compile(asset(o));
      } catch (e) {
        if (e instanceof Ts23dError) return e;
      }
      throw new Error('expected a Ts23dError');
    };
    const sp = bad({ species: 'baobab', height: 20 });
    expect(sp.code).toBe('T3D_RECIPE_INVALID');
    expect(sp.fix).toContain('oak');
    expect(bad({ species: 'oak', height: 0 }).fix).toContain('height must be > 0');
    expect(bad({ species: { ...oak, levels: [] }, height: 10 }).fix).toContain('1–3 branch levels');
  });

  it('names parts trunk / roots / crown{branches, leaves}; LOD2 drops roots, keeps main limbs', () => {
    const names = (lod: Lod) =>
      compile(asset({ species: 'oak', height: 22 }), { lod }).parts.map((p) => p.name);
    expect(names(0)).toEqual(['trunk', 'roots', 'crown', 'branches', 'leaves']);
    expect(names(1)).toEqual(['trunk', 'roots', 'crown', 'branches', 'leaves']);
    expect(names(2)).toEqual(['trunk', 'crown', 'branches', 'leaves']);
    // A palm's first-order stems are its fronds: no limbs to keep.
    expect(
      compile(asset({ species: 'palm', height: 20 }), { lod: 2 }).parts.map((p) => p.name),
    ).toEqual(['trunk', 'crown', 'leaves']);
    const pre = compile(asset({ species: 'pine', height: 25, prefix: 'pine_3' })).parts.map(
      (p) => p.name,
    );
    expect(pre).toContain('pine_3_leaves');
  });

  it('the crown sways about X and is cleared against the wood that holds it', () => {
    const crown = compile(asset({ species: 'oak', height: 22 })).parts.find(
      (p) => p.name === 'crown',
    );
    expect(crown?.motion).toEqual({ kind: 'sway', axis: [1, 0, 0], degrees: 2, hz: 0.4 });
    expect(crown?.clearOf).toEqual(['trunk', 'roots']);
  });

  for (const species of Object.keys(SPECIES)) {
    it(`${species}: triangles fall with LOD, LOD2 < 300, QA passes at every LOD`, () => {
      const o: TreeOptions = {
        species,
        height: SPECIES[species as keyof typeof SPECIES].typical.height,
      };
      const t = [0, 1, 2].map((l) => tris(o, l as Lod));
      expect(t[0]).toBeGreaterThan(t[1] ?? 0);
      expect(t[1]).toBeGreaterThan(t[2] ?? 0);
      expect(t[2]).toBeLessThan(300);
      const typical = SPECIES[species as keyof typeof SPECIES].typical;
      const a = defineAsset({
        name: species,
        kind: 'vegetation',
        budget: { triangles: [25000, 6000, 300] },
        real: treeReal(typical),
        build: (ctx) => {
          tree(ctx, { species, ...typical });
        },
      });
      for (const lod of [0, 1, 2] as Lod[]) expect(runQa(compile(a, { lod }))).toEqual([]);
      // The full QA (clashes' sway volume over thousands of leaf cards) takes seconds per LOD.
    });
  }

  it('treeReal measures only parts that carry a mesh for every species (D-measures)', () => {
    const real = treeReal({ height: 18, spread: 8, dbh: 0.4, prefix: 'b' });
    expect(real.measures?.[1]?.parts).toEqual(['b_trunk', 'b_branches', 'b_leaves']);
    // Birch has no root flare and `crown` is a group: neither may be a selector.
    const a = defineAsset({
      name: 'birch',
      kind: 'vegetation',
      budget: { triangles: [25000, 6000, 300] },
      real: treeReal(SPECIES.birch.typical),
      build: (ctx) => {
        tree(ctx, { species: 'birch', ...SPECIES.birch.typical });
      },
    });
    expect(measures(compile(a, { lod: 0 }))).toEqual([]);
  });

  for (const lod of [0, 1, 2] as Lod[]) {
    it(`LOD${lod}: trunk Y extent is the DBH, also at a narrow spread`, () => {
      for (const o of [
        { species: 'oak', height: 20, spread: 18, dbh: 1.1 },
        { species: 'oak', height: 22, spread: 10, dbh: 1.3 },
        { species: 'birch', height: 20, dbh: 0.44 },
      ]) {
        const trunk = compile(asset(o), { lod }).parts.find((p) => p.name === 'trunk')?.mesh;
        const b = trunk ? boundsOf(trunk) : null;
        expect((b?.max[1] ?? 0) - (b?.min[1] ?? 0)).toBeCloseTo(o.dbh, 3);
      }
    });

    it(`LOD${lod}: stands on z = 0, no leaf underground, height from the ground up`, () => {
      for (const o of [
        { species: 'willow', height: 12 },
        { species: 'oak', height: 6 },
      ]) {
        const meshes = worldMeshes(compile(asset(o), { lod }).parts);
        const z = (n: string) => {
          const m = meshes.get(n);
          return m ? [boundsOf(m).min[2], boundsOf(m).max[2]] : [Infinity, -Infinity];
        };
        expect(z('trunk')[0]).toBeCloseTo(0, 4);
        expect(z('leaves')[0]).toBeGreaterThanOrEqual(0);
        const top = Math.max(z('trunk')[1] ?? 0, z('branches')[1] ?? 0, z('leaves')[1] ?? 0);
        expect(top).toBeCloseTo(o.height, 3);
      }
    });
  }

  it('root flare height comes from the real trunk radius, not the DBH correction', () => {
    const stems = grow(oak, { height: 22, dbh: 1.3 }, createRng(7));
    const trunk = stems[0];
    if (!trunk) throw new Error('no trunk');
    const top = (r: number) => boundsOf(rootsMesh(trunk, oak, 0, r, createRng(1))).max[2];
    expect(top(3)).toBeCloseTo(top(1), 6);
    expect(top(1)).toBeCloseTo(2.4 * 0.65, 6);
    const wide = boundsOf(rootsMesh(trunk, oak, 0, 3, createRng(1)));
    const thin = boundsOf(rootsMesh(trunk, oak, 0, 1, createRng(1)));
    expect(wide.max[0] - wide.min[0]).toBeCloseTo(3 * (thin.max[0] - thin.min[0]), 4);
  });

  it('is deterministic per seed, and a new seed grows a different tree', () => {
    const glb = (seed: number) =>
      compile(asset({ species: 'birch', height: 15, seed })).parts.find(
        (p) => p.name === 'branches',
      )?.mesh?.positions ?? new Float32Array();
    expect(Bun.hash(glb(1))).toBe(Bun.hash(glb(1)));
    expect(Bun.hash(glb(1))).not.toBe(Bun.hash(glb(2)));
  });

  it('presets spread and override; trees.variant makes a one-line recipe', () => {
    const autumn = { ...oak, leaves: { ...oak.leaves, color: [0.6, 0.3, 0.05] as const } };
    const c = compile(asset({ species: autumn, height: 22 }));
    const leaves = c.parts.find((p) => p.name === 'leaves')?.mesh;
    expect((leaves?.colors[0] ?? 0) > (leaves?.colors[2] ?? 1)).toBe(true);
    const v = trees.variant({ name: 'willow', params: { species: 'willow', height: 12 } });
    expect(v.kind).toBe('vegetation');
    expect(compile(v).parts.map((p) => p.name)).toContain('leaves');
  });
});

describe('grow (skeleton)', () => {
  it('roots every child on its parent axis (buried in the wood) and follows the phyllotaxis', () => {
    const stems = grow(oak, { height: 22, dbh: 1.3 }, createRng(7));
    expect(stems.filter((s) => s.level === 1)).toHaveLength(8);
    for (const s of stems.slice(1)) {
      const parent = stems[s.parent];
      const p0 = s.pts[0];
      if (!parent || !p0) throw new Error('orphan stem');
      // Distance from the child's first point to the parent's polyline.
      let best = Infinity;
      for (let i = 0; i + 1 < parent.pts.length; i++) {
        const a = parent.pts[i] ?? p0;
        const b = parent.pts[i + 1] ?? a;
        const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const t = Math.max(
          0,
          Math.min(
            1,
            ((p0[0] - a[0]) * (ab[0] ?? 0) +
              (p0[1] - a[1]) * (ab[1] ?? 0) +
              (p0[2] - a[2]) * (ab[2] ?? 0)) /
              (dmath.pow(ab[0] ?? 0, 2) + dmath.pow(ab[1] ?? 0, 2) + dmath.pow(ab[2] ?? 0, 2) || 1),
          ),
        );
        const d = dmath.hypot(
          p0[0] - a[0] - t * (ab[0] ?? 0),
          p0[1] - a[1] - t * (ab[1] ?? 0),
          p0[2] - a[2] - t * (ab[2] ?? 0),
        );
        best = Math.min(best, d);
      }
      // On the axis, not just inside the bark: the root is buried, so QA sees a face, not a kiss.
      expect(best).toBeLessThan(1e-6);
    }
  });
});
