// Every exported pivot node sits where QA measured it: the GLB node's world translation and yaw
// equal `worldTransforms` of the compiled asset, also when its static parent merged into `body`.

import { describe, expect, it } from 'bun:test';
import { jointDemo } from '../../recipes/joint_demo/joint_demo.ts';
import { sound_demo } from '../../recipes/sound_demo/sound_demo.ts';
import { t34 } from '../../recipes/t34/t34.ts';
import {
  type Asset,
  type CompiledAsset,
  compile,
  defineAsset,
  type Lod,
  worldTransforms,
} from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { toGlb } from './glb.ts';

type Node = { name: string; children?: number[]; translation?: number[]; rotation?: number[] };
interface Gltf {
  scenes: { nodes: number[] }[];
  nodes: Node[];
}
const json = (glb: Uint8Array): Gltf => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};

/** Asset-frame (Z up) origin + yaw of every node below the scene root (whose Y-up turn is skipped). */
function nodeWorld(g: Gltf): Map<string, { origin: number[]; yaw: number }> {
  const out = new Map<string, { origin: number[]; yaw: number }>();
  const walk = (i: number, origin: number[], yaw: number): void => {
    const n = g.nodes[i];
    if (!n) return;
    const [x, y, z] = n.translation ?? [0, 0, 0];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const o = [
      (origin[0] ?? 0) + (x ?? 0) * c - (y ?? 0) * s,
      (origin[1] ?? 0) + (x ?? 0) * s + (y ?? 0) * c,
      (origin[2] ?? 0) + (z ?? 0),
    ];
    const q = n.rotation ?? [0, 0, 0, 1];
    const w = yaw + 2 * Math.atan2(q[2] ?? 0, q[3] ?? 1);
    out.set(n.name, { origin: o, yaw: w });
    for (const k of n.children ?? []) walk(k, o, w);
  };
  for (const r of g.scenes[0]?.nodes ?? [])
    for (const k of g.nodes[r]?.children ?? []) walk(k, [0, 0, 0], 0);
  return out;
}

const angle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Each part of `asset` that became a GLB node matches its QA world transform. */
function expectPlaced(asset: CompiledAsset): number {
  const nodes = nodeWorld(json(toGlb(asset)));
  let checked = 0;
  for (const [name, t] of worldTransforms(asset.parts)) {
    const n = nodes.get(name);
    if (!n) continue;
    checked++;
    for (const k of [0, 1, 2]) expect(n.origin[k] ?? 0).toBeCloseTo(t.origin[k] ?? 0, 5);
    expect(Math.abs(angle(n.yaw - t.yaw))).toBeLessThan(1e-5);
  }
  return checked;
}

const c: [number, number, number] = [1, 1, 1];
const hullWheel = defineAsset({
  name: 'hull_wheel',
  kind: 'vehicle',
  budget: { triangles: [999, 999, 999] },
  build(ctx) {
    ctx.part('hull', box({ size: [1, 1, 1], color: c }), { at: [0, 0, 1], yaw: Math.PI / 2 });
    ctx.part('wheel', box({ size: [0.2, 0.2, 0.2], color: c }), {
      parent: 'hull',
      at: [1, 0, 0],
      motion: { kind: 'spin', axis: [0, 1, 0], rps: 1 },
    });
  },
});

describe('pivot placement in the GLB', () => {
  it('a wheel under a yawed static hull exports at its QA position, every LOD', () => {
    for (const lod of [0, 1, 2] as Lod[]) {
      const asset = compile(hullWheel, { lod });
      const wheel = nodeWorld(json(toGlb(asset))).get('wheel');
      expect(wheel?.origin[0] ?? 9).toBeCloseTo(0, 6);
      expect(wheel?.origin[1] ?? 9).toBeCloseTo(1, 6);
      expect(wheel?.origin[2] ?? 9).toBeCloseTo(1, 6);
      expect(expectPlaced(asset)).toBe(1);
    }
  });

  it('keeps the hull yaw as the re-parented wheel rest rotation', () => {
    const g = json(toGlb(compile(hullWheel)));
    const rest = g.nodes.find((n) => n.name === 'wheel')?.rotation ?? [0, 0, 0, 1];
    expect(rest[2] ?? 0).toBeCloseTo(Math.SQRT1_2, 6);
  });

  const sweep: [string, Asset][] = [
    ['sound_demo', sound_demo],
    ['joint_demo', jointDemo()],
    ['t34', t34],
  ];
  for (const [name, def] of sweep)
    it(`${name}: every exported pivot sits at its QA world transform`, () => {
      const asset = compile(def);
      const pivots = asset.parts.filter((p) => p.mesh === null || p.motion !== null);
      expect(expectPlaced(asset)).toBe(pivots.length);
    });

  it('sound_demo exports crate_knock at the crate top, not the origin', () => {
    const knock = nodeWorld(json(toGlb(compile(sound_demo)))).get('crate_knock');
    expect(knock?.origin[1] ?? 0).toBeCloseTo(0.4, 6);
  });
});
