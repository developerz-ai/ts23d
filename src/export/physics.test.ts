// Physics export: KHR_physics_rigid_bodies + KHR_implicit_shapes on the LOD0 tree, colliders that
// no viewer draws, optional engine-convention nodes, and the Khronos validator still passing.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import type { CompiledAsset } from '../core/index.ts';
import { compile, defineAsset } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { exportGlb, exportLodGlb, toGlb } from './glb.ts';

type Node = {
  name: string;
  mesh?: number;
  children?: number[];
  extras?: { ts23d?: { collider?: string } };
  extensions?: Record<
    string,
    { motion?: Record<string, unknown>; collider?: { geometry: Record<string, number | boolean> } }
  >;
};
type Gltf = {
  extensionsUsed?: string[];
  extensions?: Record<string, { shapes?: Record<string, unknown>[]; physicsMaterials?: unknown[] }>;
  scenes: { nodes: number[] }[];
  nodes: Node[];
  meshes: unknown[];
};
const jsonOf = (glb: Uint8Array): Gltf => {
  const dv = new DataView(glb.buffer, glb.byteOffset);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + dv.getUint32(12, true))));
};

const cart = defineAsset({
  name: 'cart',
  kind: 'vehicle',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    ctx.part('bed', box({ size: [2, 1, 0.4], at: [0, 0, 0.5], strip: 'oak', color: [1, 1, 1] }));
    ctx.part(
      'wheel',
      cylinder({
        radius: 0.35,
        length: 0.1,
        segments: ctx.pick([24, 12, 8]),
        axis: 'y',
        strip: 'iron',
        color: [1, 1, 1],
      }),
      {
        at: [0.6, 0.55, 0.35],
        motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
      },
    );
    ctx.part('mast', box({ size: [0.1, 0.1, 1.5], at: [-0.8, 0, 0.7], color: [1, 1, 1] }));
  },
});
const lod0 = (): CompiledAsset => compile(cart, { lod: 0 });

async function validate(glb: Uint8Array) {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    return await validateBytes(glb);
  } finally {
    Math.random = sealed;
  }
}

describe('GLB physics', () => {
  it('writes nothing physical unless asked (Khronos drafts stay opt-in)', () => {
    const g = jsonOf(toGlb(lod0()));
    expect(JSON.stringify(g)).not.toContain('KHR_physics_rigid_bodies');
    expect(exportGlb(lod0()).physics).toBeUndefined();
  });

  it('declares both extensions, a dynamic body on the root and one collider per pivot', () => {
    const { glb, physics } = exportGlb(lod0(), { physics: true });
    const g = jsonOf(glb);
    expect(g.extensionsUsed).toContain('KHR_physics_rigid_bodies');
    expect(g.extensionsUsed).toContain('KHR_implicit_shapes');
    const motion = g.nodes[0]?.extensions?.['KHR_physics_rigid_bodies']?.motion;
    expect(motion?.['mass']).toBeGreaterThan(0);
    expect(motion?.['inertiaDiagonal']).toHaveLength(3);
    expect(motion?.['inertiaOrientation']).toHaveLength(4);
    const colliders = g.nodes.filter((n) => n.extensions?.['KHR_physics_rigid_bodies']?.collider);
    expect(colliders.map((n) => n.name).sort()).toEqual(['body_collider', 'wheel_collider']);
    expect(physics?.colliders.find((c) => c.node === 'wheel_collider')?.shape).toBe('cylinder');
    expect(physics?.body).toBe('dynamic');
    // Each wheel collider hangs under the wheel node, so it spins with it.
    const wheel = g.nodes.findIndex((n) => n.name === 'wheel');
    const wc = g.nodes.findIndex((n) => n.name === 'wheel_collider');
    expect(g.nodes[wheel]?.children).toContain(wc);
  });

  it('shapes follow the KHR_implicit_shapes schema: type + one matching property object', () => {
    const g = jsonOf(toGlb(lod0(), { physics: true }));
    const shapes = g.extensions?.['KHR_implicit_shapes']?.shapes ?? [];
    expect(shapes.length).toBeGreaterThan(0);
    for (const s of shapes) {
      const type = s['type'] as string;
      expect(['box', 'sphere', 'capsule', 'cylinder']).toContain(type);
      expect(Object.keys(s).sort()).toEqual([type, 'type'].sort());
      const p = s[type] as Record<string, number | number[]>;
      if (type === 'box') expect((p['size'] as number[]).every((v) => v > 0)).toBe(true);
      if (type === 'cylinder' || type === 'capsule') {
        expect(p['height']).toBeGreaterThan(0);
        expect(p['radiusTop']).toBe(p['radiusBottom'] as number);
      }
    }
    expect(g.extensions?.['KHR_physics_rigid_bodies']?.physicsMaterials?.length).toBeGreaterThan(0);
  });

  it('a three.js-style scene traversal draws no collider geometry', () => {
    const custom: CompiledAsset = {
      ...lod0(),
      parts: lod0().parts.map((p) =>
        p.name === 'bed' ? { ...p, collider: 'convex' as const } : p,
      ),
    };
    // `bed` is static body geometry → BODY; force the convex path through a pivot instead.
    const asPivot: CompiledAsset = {
      ...custom,
      parts: custom.parts.map((p) =>
        p.name === 'wheel' ? { ...p, collider: 'convex' as const } : p,
      ),
    };
    const g = jsonOf(toGlb(asPivot, { physics: true }));
    const drawn = new Set<number>();
    const walk = (i: number): void => {
      const n = g.nodes[i];
      if (!n) return;
      if (n.mesh !== undefined) drawn.add(n.mesh);
      for (const c of n.children ?? []) walk(c);
    };
    for (const r of g.scenes[0]?.nodes ?? []) walk(r);
    const hullMeshes = g.nodes.flatMap((n) => {
      const geo = n.extensions?.['KHR_physics_rigid_bodies']?.collider?.geometry;
      return geo && typeof geo['mesh'] === 'number' ? [geo['mesh']] : [];
    });
    expect(hullMeshes.length).toBeGreaterThan(0);
    for (const m of hullMeshes) expect(drawn.has(m)).toBe(false);
    for (const n of g.nodes) if (n.extras?.ts23d?.collider) expect(n.mesh).toBeUndefined();
  });

  it('a gun (big mantlet + long thin barrel) becomes a compound, not one blocking cone', () => {
    const gun = defineAsset({
      name: 'gun',
      kind: 'prop',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.group('gun', { motion: { kind: 'sway', axis: [0, 1, 0], degrees: 5, hz: 0.1 } });
        ctx.part('mantlet', box({ size: [0.5, 1.2, 0.8], color: [1, 1, 1] }), { parent: 'gun' });
        ctx.part(
          'barrel',
          cylinder({
            radius: 0.06,
            length: 5,
            segments: 16,
            axis: 'x',
            at: [2.75, 0, 0.4],
            color: [1, 1, 1],
          }),
          { parent: 'gun' },
        );
      },
    });
    const { physics } = exportGlb(compile(gun), { physics: true });
    const shapes = physics?.colliders.map((c) => `${c.node}:${c.shape}`);
    expect(shapes).toEqual(['gun_collider_0:box', 'gun_collider_1:cylinder']);
  });

  it('a non-pivot part that names a shape gets its own collider; none drops it', () => {
    const c = lod0();
    const parts = c.parts.map((p) =>
      p.name === 'mast' ? { ...p, collider: 'capsule' as const } : p,
    );
    const { physics } = exportGlb({ ...c, parts }, { physics: true });
    const shapes = physics?.colliders.map((x) => `${x.node}:${x.shape}`);
    expect(shapes).toContain('mast_collider:capsule');
    const none = c.parts.map((p) =>
      p.name === 'bed' || p.name === 'mast' ? { ...p, collider: 'none' as const } : p,
    );
    const n = exportGlb({ ...c, parts: none }, { physics: true }).physics;
    expect(n?.colliders.map((x) => x.node)).toEqual(['wheel_collider']);
  });

  it('engine conventions are opt-in visible meshes, flagged for loaders to hide', () => {
    const g = jsonOf(toGlb(lod0(), { physics: { conventions: ['unreal', 'godot'] } }));
    const names = g.nodes.map((n) => n.name);
    expect(names).toContain('UCX_wheel_00');
    expect(names).toContain('wheel-convcolonly');
    const ucx = g.nodes.find((n) => n.name === 'UCX_wheel_00');
    expect(ucx?.mesh).toBeDefined();
    expect(ucx?.extras?.ts23d?.collider).toBe('convex');
  });

  it('a building is a static body: no motion, auto hulls become exact trimeshes', () => {
    const shed = { ...lod0(), kind: 'building' };
    const { glb, physics } = exportGlb(shed, { physics: true });
    expect(physics?.body).toBe('static');
    expect(jsonOf(glb).nodes[0]?.extensions?.['KHR_physics_rigid_bodies']).toBeUndefined();
    expect(physics?.colliders.find((c) => c.node === 'body_collider')?.shape).toBe('mesh');
  });

  it('only the LOD0 tree carries physics in a single-file LOD GLB', () => {
    const lods = [0, 1, 2].map((lod) => compile(cart, { lod: lod as 0 | 1 | 2 }));
    const g = jsonOf(exportLodGlb(lods, { physics: true }).glb);
    const under = (i: number): string[] => {
      const n = g.nodes[i];
      return n ? [n.name, ...(n.children ?? []).flatMap(under)] : [];
    };
    const named = (name: string): number => g.nodes.findIndex((n) => n.name === name);
    expect(under(0).filter((n) => n.endsWith('_collider')).length).toBe(2);
    for (const alt of ['cart_LOD1', 'cart_LOD2'])
      expect(under(named(alt)).filter((n) => n.endsWith('_collider'))).toEqual([]);
  });

  it('is byte-deterministic and passes the Khronos validator with zero errors and warnings', async () => {
    const a = toGlb(lod0(), { physics: { conventions: ['unreal'] } });
    const b = toGlb(lod0(), { physics: { conventions: ['unreal'] } });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const report = await validate(a);
    const errors = report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
    expect(errors).toEqual([]);
  });
});
