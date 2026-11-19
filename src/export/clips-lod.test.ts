// Clips in a single-file MSFT_lod GLB key every LOD tree: a node whose rest pose or morph targets
// differ per LOD gets its own sampler, and a LOD that dropped a part's morphs gets no `weights`
// channel on it (the split file of that LOD behaves the same).
import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { type Clip, compile, defineAsset, type Mesh } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import type { Json } from './bin-writer.ts';
import { readGlbChunks } from './finish-glb.ts';
import { toGlb, toLodGlb } from './glb.ts';

const c: [number, number, number] = [0.6, 0.5, 0.4];
const LODS = [0, 1, 2] as const;

type Anim = {
  name: string;
  samplers: { input: number; output: number }[];
  channels: { sampler: number; target: { node: number; path: string } }[];
};

// The validator (compiled Dart) calls Math.random; our preload seals it (see validator.test.ts).
async function errors(glb: Uint8Array): Promise<string[]> {
  const sealed = Math.random;
  let s = 1;
  Math.random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  try {
    return (await validateBytes(glb, { maxIssues: 0 })).issues.messages
      .filter((m: { severity: number }) => m.severity === 0)
      .map((m: { code: string }) => m.code);
  } finally {
    Math.random = sealed;
  }
}

const anim = (
  glb: Uint8Array,
  name: string,
): { json: Json; bin: Uint8Array; a: Anim | undefined } => {
  const { json, bin } = readGlbChunks(glb);
  return { json, bin, a: (json['animations'] as Anim[]).find((x) => x.name === name) };
};

const blink: Clip = {
  name: 'blink',
  seconds: 1,
  loop: true,
  tracks: [
    {
      part: 'lid',
      path: 'weights',
      times: new Float32Array([0, 1]),
      values: new Float32Array([0, 1]),
    },
  ],
};
const face = defineAsset({
  name: 'face',
  kind: 'prop',
  budget: { triangles: [9999, 9999, 9999] },
  clips: [blink],
  build(ctx) {
    ctx.part('head', box({ size: [1, 1, 1], color: c }));
    const m = box({ size: [0.2, 0.2, 0.2], color: c });
    const d = new Float32Array(m.positions.length);
    d[2] = 0.05;
    const lid: Mesh = ctx.lod === 2 ? m : { ...m, morphs: [{ name: 'close', positions: d }] };
    ctx.part('lid', lid, {
      at: [0, 0, 1],
      motion: { kind: 'sway', axis: [0, 1, 0], degrees: 5, hz: 1 },
    });
  },
});

const open: Clip = {
  name: 'open',
  seconds: 1,
  loop: false,
  tracks: [
    {
      part: 'lid',
      path: 'translation',
      times: new Float32Array([0, 1]),
      values: new Float32Array([0, 0, 0, 0, 0, 0.5]),
    },
  ],
};
const hatch = defineAsset({
  name: 'hatch',
  kind: 'prop',
  budget: { triangles: [9999, 9999, 9999] },
  clips: [open],
  build(ctx) {
    ctx.part('base', box({ size: [1, 1, 1], color: c }));
    ctx.group('lid', { at: [ctx.lod === 0 ? 0.3 : -0.3, 0, 1] });
    ctx.part('lid_plate', box({ size: [0.2, 0.2, 0.1], color: c }), { parent: 'lid' });
  },
});

describe('clips across LOD trees', () => {
  it('keys weights only on the LODs whose mesh still has the morph targets', async () => {
    const glb = toLodGlb(
      LODS.map((lod) => compile(face, { lod })),
      { animations: true },
    );
    expect(await errors(glb)).toEqual([]);
    const { json, a } = anim(glb, 'blink');
    const nodes = json['nodes'] as { mesh?: number }[];
    const meshes = json['meshes'] as { weights?: number[] }[];
    const keyed = (a?.channels ?? []).map((ch) => nodes[ch.target.node]?.mesh ?? -1);
    expect(keyed).toHaveLength(2);
    for (const m of keyed) expect(meshes[m]?.weights).toEqual([0]);
  });

  it('exports the morph-less LOD2 alone without a weights channel', async () => {
    const glb = toGlb(compile(face, { lod: 2 }), { animations: true });
    expect(await errors(glb)).toEqual([]);
    expect(anim(glb, 'blink').a).toBeUndefined();
  });

  it('starts every LOD tree at its own rest position', async () => {
    const glb = toLodGlb(
      LODS.map((lod) => compile(hatch, { lod })),
      { animations: true },
    );
    expect(await errors(glb)).toEqual([]);
    const { json, bin, a } = anim(glb, 'open');
    const nodes = json['nodes'] as { translation?: number[] }[];
    const accessors = json['accessors'] as { bufferView: number; byteOffset?: number }[];
    const views = json['bufferViews'] as { byteOffset?: number }[];
    const first = (acc: number): number[] => {
      const x = accessors[acc];
      const at = (views[x?.bufferView ?? 0]?.byteOffset ?? 0) + (x?.byteOffset ?? 0);
      return [...new Float32Array(bin.slice(at, at + 12).buffer)];
    };
    expect(a?.channels).toHaveLength(3);
    for (const ch of a?.channels ?? []) {
      const rest = nodes[ch.target.node]?.translation ?? [];
      const key0 = first(a?.samplers[ch.sampler]?.output ?? 0);
      for (const [k, v] of key0.entries()) expect(v).toBeCloseTo(rest[k] ?? 0, 5);
    }
    expect(new Set(a?.channels.map((ch) => ch.sampler)).size).toBe(2);
  });
});
