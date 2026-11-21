import { describe, expect, it } from 'bun:test';
import { type Clip, compile, defineAsset } from '../core/index.ts';
import { box } from '../primitives/index.ts';
import { clipSummary } from './clips.ts';
import { readGlbChunks } from './finish-glb.ts';
import { exportLodGlb, toGlb } from './glb.ts';
import { arm } from './skin-fixtures.ts';

type Anim = {
  name: string;
  channels: { sampler: number; target: { node: number; path: string } }[];
};

const onPart = (part: string): Clip => ({
  name: 'nod',
  seconds: 1,
  loop: true,
  tracks: [
    {
      part,
      path: 'rotation',
      times: new Float32Array([0, 1]),
      values: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
    },
  ],
});

describe('named clips', () => {
  it('refuses a clip keying a part the GLB merged away', () => {
    const a = compile(arm());
    const lid = box({ size: [0.1, 0.1, 0.02], at: [0, 0, 0.6], color: [1, 1, 1] });
    const merged = {
      ...a,
      parts: [
        ...a.parts,
        { name: 'lid', mesh: lid, at: [0, 0, 0] as const, parent: null, yaw: 0, motion: null },
      ],
      clips: [onPart('lid')],
    };
    expect(() => toGlb(merged, { animations: true })).toThrow("keys part 'lid', which has no node");
  });

  it('exports rest first, run (part motions) and the declared clips', () => {
    const { json } = readGlbChunks(toGlb(compile(arm()), { animations: true }));
    const anims = json['animations'] as Anim[];
    expect(anims.map((a) => a.name)).toEqual(['rest', 'run', 'wave']);
    const nodes = json['nodes'] as { name: string }[];
    const wave = anims[2];
    expect(wave?.channels.map((c) => [nodes[c.target.node]?.name, c.target.path])).toEqual([
      ['lower', 'rotation'],
      ['body', 'weights'],
    ]);
    // Without --animations nothing is keyed.
    expect(readGlbChunks(toGlb(compile(arm()))).json['animations']).toBeUndefined();
  });

  it("keys a used child's morph weights on its own skinned node (D555)", () => {
    const holder = defineAsset({
      name: 'holder',
      kind: 'creature',
      budget: { triangles: [9999, 9999, 9999] },
      build(ctx) {
        ctx.part('plinth', box({ size: [0.4, 0.4, 0.1], color: [1, 1, 1] }));
        ctx.use(arm(), { prefix: 'a' });
      },
    });
    const { json } = readGlbChunks(toGlb(compile(holder), { animations: true }));
    const nodes = json['nodes'] as { name: string; skin?: number; children?: number[] }[];
    const wave = (json['animations'] as Anim[]).find((a) => a.name === 'a_wave');
    expect(wave?.channels.map((c) => [nodes[c.target.node]?.name, c.target.path])).toEqual([
      ['a_lower', 'rotation'],
      ['a_body', 'weights'],
    ]);
    const body = nodes.findIndex((n) => n.name === 'a_body');
    expect(nodes[body]?.skin).toBe(0);
    // A skinned mesh sits on the LOD root (node 0), not under the `a` group.
    expect(nodes[0]?.children).toContain(body);
  });

  it('keys every LOD tree from one sampler in a single-file GLB', () => {
    const lods = ([0, 1, 2] as const).map((lod) => compile(arm(), { lod }));
    const { json } = readGlbChunks(exportLodGlb(lods, { animations: true }).glb);
    const wave = (json['animations'] as Anim[]).find((a) => a.name === 'wave');
    const lower = (wave?.channels ?? []).filter((c) => c.target.path === 'rotation');
    expect(lower.length).toBe(3);
    expect(new Set(lower.map((c) => c.sampler)).size).toBe(1);
  });

  it('summarises clips for the manifest with root speed', () => {
    const walk: Clip = {
      name: 'walk',
      seconds: 2,
      loop: true,
      tracks: [
        {
          bone: 'upper',
          path: 'translation',
          times: new Float32Array([0, 2]),
          values: new Float32Array([0, 0, 0, 3, 0, 0]),
        },
      ],
    };
    expect(clipSummary([walk], true, 4)).toEqual([
      { name: 'run', seconds: 4, loop: true, speed: 0 },
      { name: 'walk', seconds: 2, loop: true, speed: 1.5 },
    ]);
  });
});
