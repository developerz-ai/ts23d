// Single-file LODs (MSFT_lod): alternates outside the scene, extension used not required,
// coverage strictly descending, motion channels on every LOD, shared materials, Khronos-valid.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, defineAsset, type Lod } from '../core/index.ts';
import { box, cylinder } from '../primitives/index.ts';
import { exportLodGlb, toGlb, toLodGlb } from './glb.ts';
import { coverageFor, defaultCoverage } from './lod-coverage.ts';

const c: [number, number, number] = [0.5, 0.45, 0.4];
const cart = defineAsset({
  name: 'cart',
  kind: 'vehicle',
  budget: { triangles: [9999, 9999, 9999] },
  build(ctx) {
    ctx.part('bed', box({ size: [2, 1, 0.4], at: [0, 0, 0.6], color: c }));
    const segments = ctx.lod === 0 ? 24 : ctx.lod === 1 ? 12 : 6;
    for (const side of [-1, 1])
      ctx.part(
        `wheel_${side < 0 ? 'l' : 'r'}`,
        cylinder({ radius: 0.4, length: 0.1, segments, axis: 'y', color: c }),
        { at: [0, side * 0.6, 0.4], motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 } },
      );
    if (ctx.lod === 0) ctx.part('lamp', box({ size: [0.1, 0.1, 0.1], at: [1, 0, 0.9], color: c }));
    ctx.socket('headlamp', {
      kind: 'light',
      at: [1.06, 0, 0.9],
      dir: [1, 0, 0],
      data: { light: 'spot', intensity: 50 },
    });
  },
});

const all = ([0, 1, 2] as Lod[]).map((lod) => compile(cart, { lod }));
type Node = { name: string; children?: number[]; extensions?: Json; extras?: Json; mesh?: number };
type Json = Record<string, unknown>;
interface Gltf {
  scenes: { nodes: number[] }[];
  nodes: Node[];
  meshes: unknown[];
  materials: unknown[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  animations?: { name: string; channels: { target: { node: number; path: string } }[] }[];
  extensions?: { KHR_lights_punctual?: { lights: unknown[] } };
}
const json = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};
const ids = (g: Gltf): number[] =>
  ((g.nodes[0]?.extensions?.['MSFT_lod'] as { ids?: number[] } | undefined)?.ids ?? []).slice();
const reachable = (g: Gltf): Set<number> => {
  const seen = new Set<number>();
  const walk = (i: number): void => {
    seen.add(i);
    for (const k of g.nodes[i]?.children ?? []) walk(k);
  };
  for (const r of g.scenes[0]?.nodes ?? []) walk(r);
  return seen;
};

describe('toLodGlb: refusals', () => {
  it('refuses LODs out of order or from different assets', () => {
    expect(() => toLodGlb([all[1], all[0]].flatMap((a) => (a ? [a] : [])))).toThrow(
      /LODs \[1, 0\]/,
    );
    expect(() => toLodGlb([])).toThrow(/T3D_RECIPE_INVALID|ONE asset/);
  });

  it('refuses coverage that is not strictly descending in [0, 1)', () => {
    for (const bad of [
      [0.2, 0.5, 0.01],
      [0.5, 0.5, 0.01],
      [1, 0.5, 0.01],
      [0.5, 0.2, -0.1],
    ] as const)
      expect(() => toLodGlb(all, { lodCoverage: bad })).toThrow(/strictly descending/);
  });
});

describe('toLodGlb', () => {
  const g = json(toLodGlb(all, { animations: true }));

  it('keeps alternates out of the scene: a viewer without MSFT_lod sees LOD0 only', () => {
    expect(g.scenes[0]?.nodes).toEqual([0]);
    expect(ids(g)).toHaveLength(2);
    const seen = reachable(g);
    for (const id of ids(g)) expect(seen.has(id)).toBe(false);
    expect(ids(g).map((i) => g.nodes[i]?.name)).toEqual(['cart_LOD1', 'cart_LOD2']);
    expect(seen.size).toBe(json(toGlb(all[0] ?? compile(cart))).nodes.length);
  });

  it('lists MSFT_lod as used, never required (Godot rejects unknown required extensions)', () => {
    expect(g.extensionsUsed).toContain('MSFT_lod');
    expect(g.extensionsRequired).toBeUndefined();
  });

  it('writes strictly descending screen coverage, one entry per LOD', () => {
    const cov = g.nodes[0]?.extras?.['MSFT_screencoverage'] as number[];
    expect(cov).toHaveLength(3);
    for (let i = 1; i < cov.length; i++) expect(cov[i] ?? 1).toBeLessThan(cov[i - 1] ?? 0);
    expect(cov[0] ?? 1).toBeLessThan(1);
  });

  it('drives the same part names in every LOD, sharing one sampler per motion', () => {
    const run = g.animations?.find((a) => a.name === 'run');
    const driven = (run?.channels ?? []).map((ch) => g.nodes[ch.target.node]?.name).sort();
    expect(driven).toEqual(['wheel_l', 'wheel_l', 'wheel_l', 'wheel_r', 'wheel_r', 'wheel_r']);
    const rest = g.animations?.find((a) => a.name === 'rest');
    expect(rest?.channels.map((ch) => ch.target.node)).toEqual([0, ...ids(g)]);
  });

  it('shares materials and lights instead of copying them per LOD', () => {
    expect(g.materials).toHaveLength(json(toGlb(all[0] ?? compile(cart))).materials.length);
    expect(g.extensions?.KHR_lights_punctual?.lights).toHaveLength(1);
    expect(g.nodes.filter((n) => n.name === 'headlamp_light')).toHaveLength(3);
  });

  it('is byte-deterministic', () => {
    expect(Bun.hash(toLodGlb(all))).toBe(Bun.hash(toLodGlb(all)));
  });

  it('writes a plain GLB (no MSFT_lod) for a single LOD', () => {
    const one = json(toLodGlb([all[0] ?? compile(cart)]));
    expect(one.extensionsUsed ?? []).not.toContain('MSFT_lod');
    expect(Bun.hash(toLodGlb([all[0] ?? compile(cart)]))).toBe(
      Bun.hash(toGlb(all[0] ?? compile(cart))),
    );
  });
});

describe('screen coverage', () => {
  it('maps a LOD subset onto the [0→1, 1→2, cull] thresholds', () => {
    expect(coverageFor([0, 1, 2], [0.5, 0.2, 0.01])).toEqual([0.5, 0.2, 0.01]);
    expect(coverageFor([0, 2], [0.5, 0.2, 0.01])).toEqual([0.2, 0.01]);
    expect(coverageFor([0, 1], [0.5, 0.2, 0.01])).toEqual([0.5, 0.01]);
  });

  it('derives descending defaults from triangle density, honouring the recipe override', () => {
    const [a, b, cull] = defaultCoverage(all);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(cull);
    const own = compile(defineAsset({ ...cart, lodCoverage: [0.4, 0.1, 0] }), { lod: 0 });
    const { coverage } = exportLodGlb([own, ...all.slice(1)]);
    expect(coverage).toEqual([0.4, 0.1, 0]);
  });
});

it('glTF-Validator: 0 errors, 0 warnings with alternates and animations', async () => {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    const report = await validateBytes(toLodGlb(all, { animations: true }));
    const bad = report.issues.messages.filter((m: { severity: number }) => m.severity <= 1);
    expect(bad).toEqual([]);
  } finally {
    Math.random = sealed;
  }
});

describe('prepared-LOD memo (split + single export share one optimise)', () => {
  it('a different optimize option on the same compiled LOD is not served from the memo', () => {
    const a = compile(cart, { lod: 0 });
    const raw = toGlb(a, { optimize: false });
    const optimised = toGlb(a);
    expect(Bun.hash(optimised)).not.toBe(Bun.hash(raw));
    expect(Bun.hash(raw)).toBe(Bun.hash(toGlb(compile(cart, { lod: 0 }), { optimize: false })));
  });
  it('split then single export gives the bytes of a fresh single export', () => {
    const fresh = ([0, 1, 2] as Lod[]).map((lod) => compile(cart, { lod }));
    const used = ([0, 1, 2] as Lod[]).map((lod) => compile(cart, { lod }));
    for (const l of used) toGlb(l, { animations: true });
    expect(Bun.hash(toLodGlb(used, { animations: true }))).toBe(
      Bun.hash(toLodGlb(fresh, { animations: true })),
    );
  });
});
