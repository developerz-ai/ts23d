import { describe, expect, it } from 'bun:test';
import { compile, defineAsset } from './asset.ts';
import { catalogueOf, definePart } from './define-part.ts';
import { placePiece } from './define-part-place.ts';
import { Ts23dError } from './errors.ts';
import { boundsOf, type Mesh, MeshBuilder, triangleCount } from './mesh.ts';

/** A one-triangle-per-LOD-step test mesh of size s: real geometry without importing primitives. */
function tri(s: number, n = 1): Mesh {
  const b = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const v = (p: [number, number, number]) =>
      b.vertex({ p, n: [0, 0, 1], uv: [0, 0], color: [1, 1, 1] });
    b.tri(v([i, 0, 0]), v([i + s, 0, 0]), v([i, s, 0]));
  }
  return b.build();
}

type Size = 'M6' | 'M8';
const bolt = definePart({
  name: 'test_bolt',
  description: 'test bolt',
  tags: ['fastener'],
  params: { size: 'M8' as Size, length: 0.03, count: 1 },
  schema: {
    size: { oneOf: ['M6', 'M8'], doc: 'metric size' },
    length: { min: 0.005, max: 0.3, unit: 'm' },
  },
  validate: (p) => (p.count > 3 ? `count ${p.count} > 3` : undefined),
  build: (b, p) => tri(p.length, b.pick([3, 2, 1]) * p.count),
});

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return e instanceof Ts23dError ? `${e.code}|${e.fix}` : 'other';
  }
  return 'none';
}

describe('definePart params', () => {
  it('rejects unknown, mistyped, out-of-range and invalid params with T3D_PART_PARAMS + fix', () => {
    expect(code(() => bolt.mesh({ lenght: 0.02 } as never))).toContain('T3D_PART_PARAMS');
    expect(code(() => bolt.mesh({ lenght: 0.02 } as never))).toContain("did you mean 'length'");
    expect(code(() => bolt.mesh({ length: '3' } as never))).toContain('pass a number');
    expect(code(() => bolt.mesh({ length: 1 }))).toContain('length <= 0.3');
    expect(code(() => bolt.mesh({ size: 'M5' as Size }))).toContain('"M6", "M8"');
    expect(code(() => bolt.mesh({ count: 9 }))).toContain('T3D_PART_PARAMS');
    expect(code(() => bolt.mesh({ length: Number.NaN }))).toContain('finite');
  });

  it('refuses a bad name, non-plain defaults and bad piece names at definition/build time', () => {
    expect(
      code(() => definePart({ name: 'Bolt', description: '', params: {}, build: () => tri(1) })),
    ).toContain('T3D_RECIPE_INVALID');
    expect(
      code(() =>
        definePart({ name: 'x', description: '', params: { f: {} as never }, build: () => tri(1) }),
      ),
    ).toContain('T3D_PART_PARAMS');
    const dup = definePart({
      name: 'dup',
      description: '',
      params: {},
      build: () => [
        { name: 'a', mesh: tri(1) },
        { name: 'a', mesh: tri(1) },
      ],
    });
    expect(code(() => dup.mesh())).toContain('T3D_RECIPE_INVALID');
  });

  it('merges overrides onto defaults, ignoring undefined', () => {
    expect(bolt.params({ length: 0.05, count: undefined })).toEqual({
      size: 'M8',
      length: 0.05,
      count: 1,
    });
  });
});

describe('definePart build', () => {
  it('builds once per (params, LOD) and serves repeats from the cache', () => {
    const p = definePart({
      name: 'cached',
      description: '',
      params: { s: 1 },
      build: (_, q) => tri(q.s),
    });
    const a = p.mesh({ s: 2 }, 0);
    const b = p.mesh({ s: 2 }, { lod: 0 });
    expect(b).toBe(a);
    p.mesh({ s: 2 }, 1);
    p.mesh({ s: 3 }, 0);
    expect(p.stats()).toEqual({ builds: 3, hits: 1 });
  });

  it('is LOD-aware: pick per LOD, upTo drops, map reuses a build', () => {
    expect([0, 1, 2].map((l) => triangleCount(bolt.mesh({}, l as 0 | 1 | 2)))).toEqual([3, 2, 1]);
    const rivet = definePart({
      name: 'rivet_t',
      description: '',
      params: {},
      lod: { upTo: 1, map: [0, 0, 2] },
      build: (b) => tri(1, b.pick([4, 2, 1])),
    });
    expect(triangleCount(rivet.mesh({}, 1))).toBe(4);
    expect(triangleCount(rivet.mesh({}, 2))).toBe(0);
    expect(rivet.pieces({}, 2)).toEqual([]);
    expect(triangleCount(rivet.mesh({}, 2, 2))).toBe(1);
  });

  it('composes: parts call parts at their own LOD', () => {
    const pair = definePart({
      name: 'pair',
      description: '',
      params: {},
      build: (b) => [
        { name: 'a', mesh: b.mesh(bolt) },
        { name: 'b', mesh: b.mesh(bolt, { size: 'M6' }), at: [1, 0, 0] },
      ],
    });
    const m = pair.mesh({}, 2);
    expect(triangleCount(m)).toBe(2);
    expect(boundsOf(m).max[0]).toBeCloseTo(1.03, 5);
  });

  it('gives a stable rng per params: same params, same numbers', () => {
    const noisy = definePart({
      name: 'noisy',
      description: '',
      params: { s: 1 },
      build: (b, p) => tri(p.s + b.rng.next()),
    });
    const x = boundsOf(noisy.mesh({ s: 1 })).max[0];
    const other = definePart({
      ...{ name: 'noisy', description: '' },
      params: { s: 1 },
      build: (b, p) => tri(p.s + b.rng.next()),
    });
    expect(boundsOf(other.mesh({ s: 1 })).max[0]).toBe(x);
    // Different params, a different stream: the draw (max − s) differs.
    expect(boundsOf(noisy.mesh({ s: 2 })).max[0] - 2).not.toBeCloseTo(x - 1, 6);
  });
});

describe('placePiece motion', () => {
  const leaf = {
    name: 'leaf',
    mesh: null,
    motion: { kind: 'sway', axis: [0, 0, 1], degrees: 90, hz: 0.2, oneWay: true },
  } as const;
  const axisOf = (place: Parameters<typeof placePiece>[1]) => {
    const m = placePiece(leaf, place).motion;
    return m?.kind === 'sway' ? m.axis : null;
  };

  it('negates a sway axis under a mirror, so the hinge swings as the mirror image', () => {
    expect(axisOf({ scale: [-1, 1, 1] })).toEqual([0, 0, -1]);
  });

  it('keeps the axis without a mirror, normalised under scale', () => {
    expect(axisOf({})).toEqual([0, 0, 1]);
    expect(axisOf({ scale: [1, 1, 3] })).toEqual([0, 0, 1]);
  });
});

describe('definePart lod policy', () => {
  it('refuses a map that is not three non-decreasing LODs, or a bad upTo', () => {
    const bad = (lod: object) =>
      code(() =>
        definePart({
          name: 'bad_lod',
          description: '',
          params: {},
          lod: lod as never,
          build: () => tri(1),
        }),
      );
    expect(bad({ map: [2, 0, 0] })).toMatch(/^T3D_RECIPE_INVALID\|/);
    expect(bad({ map: [0, 3, 3] })).toMatch(/^T3D_RECIPE_INVALID\|/);
    expect(bad({ map: [0, 1] })).toMatch(/^T3D_RECIPE_INVALID\|/);
    expect(bad({ upTo: 5 })).toMatch(/^T3D_RECIPE_INVALID\|/);
    expect(bad({ map: [0, 0, 1], upTo: 1 })).toBe('none');
  });
});

describe('definePart in an asset', () => {
  const door = definePart({
    name: 'door_t',
    description: 'a door that swings',
    params: { w: 1 },
    build: (_, p) => [
      { name: 'frame', mesh: tri(p.w) },
      {
        name: 'leaf',
        mesh: tri(0.5),
        at: [0, 1, 0],
        motion: { kind: 'sway', axis: [0, 0, 1], degrees: 80, hz: 0.2, oneWay: true },
        clearOf: ['frame'],
      },
    ],
  });
  const asset = defineAsset({
    name: 'part_host',
    kind: 'prop',
    budget: { triangles: [100, 100, 100] },
    build(ctx) {
      bolt(ctx, 'bolt_0', { length: 0.02 }, { at: [1, 0, 0] });
      bolt(ctx, 'bolt_far', {}, { upTo: 1 });
      door(ctx, 'door', {}, { at: [0, 0, 1], place: { yaw: Math.PI / 2 }, clearOf: ['floor'] });
    },
  });

  it('adds one part per one-mesh call and a group of pieces otherwise', () => {
    const c = compile(asset);
    expect(c.parts.map((p) => p.name)).toEqual([
      'bolt_0',
      'bolt_far',
      'door',
      'door_frame',
      'door_leaf',
    ]);
    const leaf = c.parts.find((p) => p.name === 'door_leaf');
    expect(leaf?.parent).toBe('door');
    // The moving piece gets its sibling (prefixed) plus the call's clearOf; static pieces none.
    expect(leaf?.clearOf).toEqual(['door_frame', 'floor']);
    expect(c.parts.find((p) => p.name === 'door_frame')?.clearOf).toBeUndefined();
    expect(leaf?.motion?.kind).toBe('sway');
    expect(leaf?.at[0]).toBeCloseTo(-1, 6);
    expect(c.parts.find((p) => p.name === 'door')?.at).toEqual([0, 0, 1]);
    expect(compile(asset, { lod: 2 }).parts.map((p) => p.name)).not.toContain('bolt_far');
  });

  it('describes itself for a catalogue, sorted by name', () => {
    const rows = catalogueOf([door, bolt]);
    expect(rows.map((r) => r.name)).toEqual(['door_t', 'test_bolt']);
    expect(rows[1]?.params[0]).toEqual({
      name: 'size',
      type: 'string',
      default: 'M8',
      doc: 'metric size',
      oneOf: ['M6', 'M8'],
    });
    expect(rows[1]?.params[1]).toMatchObject({ name: 'length', unit: 'm', min: 0.005, max: 0.3 });
  });
});
