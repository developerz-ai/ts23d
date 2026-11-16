import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { box } from '../primitives/index.ts';
import {
  GPU_INSTANCING,
  type InstancedScene,
  sceneManifest,
  toInstancedGlb,
} from './instancing.ts';

const window = box({ size: [0.06, 1, 1.4], color: [0.2, 0.25, 0.3] });
const body = box({ size: [10, 8, 12], at: [0, 0, 0], color: [0.5, 0.3, 0.2] });
const scene: InstancedScene = {
  name: 'block',
  base: body,
  sets: [
    {
      name: 'window',
      mesh: window,
      transforms: [
        { at: [5, -2, 3] },
        { at: [5, 2, 3], yaw: 0 },
        { at: [0, 4, 6], yaw: Math.PI / 2, scale: [1, 1.2, 1] },
      ],
    },
  ],
  copyright: '© OpenStreetMap contributors, ODbL 1.0',
};

// The validator (compiled Dart) calls Math.random; our preload seals it (see validator.test.ts).
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

const json = (glb: Uint8Array): Record<string, unknown> => {
  const len = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
};

describe('toInstancedGlb', () => {
  it('refuses an empty set, a duplicate name and a non-finite transform', () => {
    const set = scene.sets[0];
    if (!set) throw new Error('fixture');
    expect(() => toInstancedGlb({ ...scene, sets: [{ ...set, transforms: [] }] })).toThrow(
      'no instances',
    );
    expect(() => toInstancedGlb({ ...scene, sets: [set, set] })).toThrow('twice');
    expect(() =>
      toInstancedGlb({ ...scene, sets: [{ ...set, transforms: [{ at: [Number.NaN, 0, 0] }] }] }),
    ).toThrow('not finite');
  });

  it('writes one instanced node per set with TRANSLATION/ROTATION/SCALE and the credit', () => {
    const g = json(toInstancedGlb(scene));
    expect(g['extensionsUsed']).toEqual([GPU_INSTANCING]);
    const nodes = g['nodes'] as Record<string, unknown>[];
    const inst = nodes.find((n) => n['name'] === 'window');
    const exts = (inst?.['extensions'] ?? {}) as Record<
      string,
      { attributes: Record<string, number> }
    >;
    const ext = exts[GPU_INSTANCING];
    expect(Object.keys(ext?.attributes ?? {}).sort()).toEqual(['ROTATION', 'SCALE', 'TRANSLATION']);
    const acc = g['accessors'] as { count: number }[];
    expect(acc[ext?.attributes['TRANSLATION'] ?? -1]?.count).toBe(3);
    expect((g['asset'] as { copyright?: string }).copyright).toContain('OpenStreetMap');
  });

  it('validates with zero errors (Khronos glTF-Validator)', async () => {
    const report = await validate(toInstancedGlb(scene));
    const msgs = (report.issues as { messages: { severity: number; code: string }[] }).messages;
    expect(msgs.filter((m) => m.severity <= 1).map((m) => m.code)).toEqual([]);
  });

  it('is deterministic and the manifest counts what the GLB holds', () => {
    expect(toInstancedGlb(scene)).toEqual(toInstancedGlb(scene));
    const m = sceneManifest(scene);
    expect([m.uniqueMeshes, m.instances, m.sets[0]?.count]).toEqual([2, 3, 3]);
    expect(m.baseTriangles).toBe(12);
  });
});
