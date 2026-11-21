import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile, Ts23dError } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { readGlbChunks } from './finish-glb.ts';
import { exportLodGlb, toGlb } from './glb.ts';
import { bindLoose } from './skin.ts';
import { arm } from './skin-fixtures.ts';

type Message = { severity: number; code: string; pointer?: string; message?: string };

// The validator (compiled Dart) calls Math.random; our preload seals it. Seed a stand-in.
async function validate(glb: Uint8Array): Promise<{ issues: { messages: Message[] } }> {
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

// A skinned node is not a scene root and carries the inverse root turn on purpose (skin.ts:
// world identity makes spec-following and three.js-style engines agree): those two warnings stay.
const BY_DESIGN = new Set(['NODE_SKINNED_MESH_NON_ROOT', 'NODE_SKINNED_MESH_LOCAL_TRANSFORMS']);
const problems = (r: { issues: { messages: Message[] } }): Message[] =>
  r.issues.messages.filter((m) => m.severity <= 1 && !BY_DESIGN.has(m.code));

type Node = { name?: string; children?: number[]; skin?: number; translation?: number[] };

describe('skinned GLB', () => {
  it('refuses a skinned part under a moving pivot and a socket on a missing bone', () => {
    const a = compile(arm());
    const moved = {
      ...a,
      parts: a.parts.map((p) =>
        p.name === 'body'
          ? {
              ...p,
              at: [0, 0, 1] as const,
              motion: { kind: 'spin' as const, axis: [0, 0, 1] as const, rps: 1 },
            }
          : p,
      ),
    };
    // keepParts: merging would put the static parts into a second 'body' node, refused first.
    expect(() => toGlb(moved, { keepParts: true })).toThrow('is moved or parented');
    const lost = {
      ...a,
      parts: a.parts.map((p) =>
        p.socket ? { ...p, socket: { ...p.socket, data: { bone: 'tail_9' } } } : p,
      ),
    };
    expect(() => toGlb(lost)).toThrow(Ts23dError);
  });

  it('writes joints, inverse bind matrices, JOINTS_0/WEIGHTS_0 and a socket on its bone', () => {
    const { json } = readGlbChunks(toGlb(compile(arm()), { animations: true }));
    const nodes = json['nodes'] as Node[];
    const skins = json['skins'] as { joints: number[]; inverseBindMatrices: number }[];
    expect(skins.length).toBe(1);
    expect(skins[0]?.joints.map((j) => nodes[j]?.name)).toEqual(['upper', 'lower']);
    const lower = nodes.findIndex((n) => n.name === 'lower');
    expect(nodes[lower]?.translation).toEqual([0.5, 0, 0]);
    const hand = nodes.findIndex((n) => n.name === 'hand');
    expect(nodes[lower]?.children).toContain(hand);
    expect(nodes[hand]?.translation?.map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.5, 0, 0]);
    const body = nodes.find((n) => n.name === 'body');
    expect(body?.skin).toBe(0);
    const meshes = json['meshes'] as { primitives: { attributes: Record<string, number> }[] }[];
    const attrs = meshes[0]?.primitives[0]?.attributes ?? {};
    expect(Object.keys(attrs)).toContain('JOINTS_0');
    expect(Object.keys(attrs)).toContain('WEIGHTS_0');
    const accessors = json['accessors'] as { type: string; count: number }[];
    expect(accessors[skins[0]?.inverseBindMatrices ?? -1]).toMatchObject({
      type: 'MAT4',
      count: 2,
    });
  });

  it('keeps the world yaw of a socket that rides a bone (D557)', () => {
    const a = compile(arm());
    const mount = {
      name: 'mount',
      mesh: null,
      at: [0.8, 0, 0.5] as const,
      parent: null,
      yaw: Math.PI / 2,
      motion: null,
    };
    const turned = {
      ...a,
      parts: a.parts.flatMap((p) =>
        p.name === 'hand' ? [mount, { ...p, at: [0.2, 0, 0] as const, parent: 'mount' }] : [p],
      ),
    };
    const { json } = readGlbChunks(toGlb(turned));
    const nodes = json['nodes'] as (Node & { rotation?: number[] })[];
    const hand = nodes.find((n) => n.name === 'hand');
    const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
    // World (0.8, 0.2, 0.5) yawed 90°, on `lower` whose head is (0.5, 0, 0.5).
    expect(hand?.translation?.map(r6)).toEqual([0.3, 0.2, 0]);
    expect(hand?.rotation?.map(r6)).toEqual([0, 0, r6(Math.SQRT1_2), r6(Math.SQRT1_2)]);
  });

  it('binds a rigid mesh merging into a skinned one to its nearest bone', () => {
    const a = compile(arm());
    const body = a.parts.find((p) => p.name === 'body')?.mesh;
    expect(body?.joints).toBeDefined();
    if (!body?.joints) return;
    const near = (x: number) =>
      box({ size: [0.05, 0.05, 0.05], at: [x, 0, 0.5], color: [1, 1, 1] });
    const [, upper, lower] = bindLoose([body, near(0.1), near(0.9)], a.skeleton);
    expect([upper?.joints?.[0], upper?.weights?.[0]]).toEqual([0, 1]);
    expect([lower?.joints?.[0], lower?.weights?.[0]]).toEqual([1, 1]);
    expect(bindLoose([near(0.1)], a.skeleton)[0]?.joints).toBeUndefined();
  });

  it('validates with 0 errors and 0 unexpected warnings (skin + morph + clips, all LODs)', async () => {
    const lods = [0, 1, 2].map((lod) => compile(arm(), { lod: lod as 0 | 1 | 2 }));
    for (const glb of [
      toGlb(lods[0] ?? compile(arm()), { animations: true, physics: true }),
      exportLodGlb(lods, { animations: true }).glb,
    ]) {
      const report = await validate(glb);
      expect(problems(report)).toEqual([]);
      expect(report.issues.messages.filter((m) => m.severity === 0)).toEqual([]);
    }
  });

  it('is byte-deterministic', () => {
    expect(toGlb(compile(arm()), { animations: true })).toEqual(
      toGlb(compile(arm()), { animations: true }),
    );
  });
});
