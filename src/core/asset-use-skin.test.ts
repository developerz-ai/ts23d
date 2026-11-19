import { describe, expect, it } from 'bun:test';
import { box } from '../primitives/index.ts';
import { compile, defineAsset, type Mesh } from './index.ts';

const budget = { triangles: [800, 300, 80] as [number, number, number] };

/** Every vertex fully on bone `joint` of the asset that builds it. */
const boundTo = (joint: number): Mesh => {
  const m = box({ size: [0.2, 0.2, 1], color: [1, 1, 1] });
  const n = m.positions.length / 3;
  return {
    ...m,
    joints: Uint16Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? joint : 0)),
    weights: Float32Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)),
  };
};

/** Two bones; the skin rides the second (`fore`, index 1); a grip socket rides it too. */
const arm = defineAsset({
  name: 'arm',
  kind: 'prop',
  budget,
  build(ctx) {
    ctx.bone('upper', { head: [0, 0, 0], tail: [0, 0, 0.5] });
    ctx.bone('fore', { head: [0, 0, 0.5], tail: [0, 0, 1], parent: 'upper' });
    ctx.part('skin', boundTo(1));
    ctx.socket('grip', { kind: 'attach', at: [0, 0, 1], data: { bone: 'fore', slot: 2 } });
  },
});

const rig = defineAsset({
  name: 'rig',
  kind: 'prop',
  budget,
  build(ctx) {
    ctx.bone('root', { head: [0, 0, 0], tail: [0, 0, 0.1] });
    ctx.bone('hip', { head: [0, 0, 0.1], tail: [0, 0, 0.2], parent: 'root' });
    ctx.use(arm, { prefix: 'l', at: [0, 1, 0] });
    ctx.use(arm, { prefix: 'r', at: [0, -1, 0] });
  },
});

describe('ctx.use of a skinned child', () => {
  const c = compile(rig);
  const names = c.skeleton?.bones.map((b) => b.name) ?? [];
  const boneOf = (part: string): (string | undefined)[] => {
    const m = c.parts.find((p) => p.name === part)?.mesh;
    const n = (m?.positions.length ?? 0) / 3;
    return [...new Set(Array.from({ length: n }, (_, v) => names[m?.joints?.[v * 4] ?? -1]))];
  };

  it("fails if a used skin still indexes the child's own skeleton (fore → the parent's hip)", () => {
    expect(names).toEqual(['root', 'hip', 'l_upper', 'l_fore', 'r_upper', 'r_fore']);
    expect(boneOf('l_skin')).toEqual(['l_fore']);
    expect(boneOf('r_skin')).toEqual(['r_fore']);
  });

  it('keeps every joint slot inside the skeleton and leaves the child asset untouched', () => {
    for (const p of c.parts)
      for (const j of p.mesh?.joints ?? []) expect(j).toBeLessThan(names.length);
    expect(compile(arm).parts.find((p) => p.name === 'skin')?.mesh?.joints?.[0]).toBe(1);
  });

  it("prefixes the bone a used socket rides (the parent has no bone named 'fore')", () => {
    expect(c.parts.find((p) => p.name === 'l_grip')?.socket?.data).toEqual({
      bone: 'l_fore',
      slot: 2,
    });
    expect(c.parts.find((p) => p.name === 'r_grip')?.socket?.data?.['bone']).toBe('r_fore');
  });

  it('nests: a rig used by another asset lands on the doubly prefixed bones', () => {
    const pair = defineAsset({
      name: 'pair',
      kind: 'prop',
      budget,
      build(ctx) {
        ctx.bone('base', { head: [0, 0, 0], tail: [0, 0, 0.05] });
        ctx.use(rig, { prefix: 'a' });
      },
    });
    const p = compile(pair);
    const m = p.parts.find((x) => x.name === 'a_r_skin')?.mesh;
    expect(p.skeleton?.bones[m?.joints?.[0] ?? -1]?.name).toBe('a_r_fore');
  });

  it('a skinned child used by a boneless parent keeps its indices (same mesh object)', () => {
    const solo = defineAsset({
      name: 'solo',
      kind: 'prop',
      budget,
      build: (ctx) => ctx.use(arm, { prefix: 'only' }),
    });
    const s = compile(solo);
    const m = s.parts.find((p) => p.name === 'only_skin')?.mesh;
    expect(s.skeleton?.bones[m?.joints?.[0] ?? -1]?.name).toBe('only_fore');
  });
});
