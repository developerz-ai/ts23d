// The finished GLB: refused when finish QA failed (unless forced), Khronos-valid, byte-stable, and
// everything but LOD0's trim material identical to the plain export — nodes, pivots, animations,
// LOD1/2 meshes. HTTP adapter: request shape and failures carry T3D_FINISH_* codes.

import { describe, expect, it } from 'bun:test';
import { validateBytes } from 'gltf-validator';
import { compile } from '../core/index.ts';
import { exportLodGlb, readGlbChunks } from '../export/index.ts';
import { cart, repaint } from './fixtures.ts';
import { finishAsset, finishedGlb, httpFinish, mockFinish } from './index.ts';

const SMALL = { views: 6, size: 96, atlas: 256 } as const;
const lods = [0, 1, 2].map((lod) => compile(cart, { lod: lod as 0 | 1 | 2 }));
const lower = lods.slice(1);
type J = Record<string, unknown>;
const list = (j: J, k: string): J[] => (j[k] as J[] | undefined) ?? [];

// The validator (compiled Dart) calls Math.random; give it a seeded stand-in for the call only.
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

describe('finishedGlb', () => {
  it('refuses a rejected finish unless forced, and records why', async () => {
    const bad = await finishAsset(compile(cart, { lod: 0 }), {
      ...SMALL,
      model: repaint,
      prompt: 'x',
    });
    expect(() => finishedGlb(bad, lower)).toThrow('T3D_FINISH_PALETTE_DRIFT');
    const forced = readGlbChunks(finishedGlb(bad, lower, { force: true })).json;
    expect(JSON.stringify(forced['extras'])).toContain('forced');
  });

  it('keeps every node, animation and LOD1/2 mesh; swaps only LOD0 trim primitives', async () => {
    const r = await finishAsset(compile(cart, { lod: 0 }), {
      ...SMALL,
      model: mockFinish(),
      prompt: 'rust',
    });
    const o = { animations: true };
    const glb = finishedGlb(r, lower, o);
    expect(Bun.hash(glb)).toBe(Bun.hash(finishedGlb(r, lower, o)));
    const report = await validate(glb);
    expect(report.issues.numErrors).toBe(0);
    const fin = readGlbChunks(glb);
    const plain = readGlbChunks(exportLodGlb(lods, o).glb);
    expect(fin.json['nodes']).toEqual(plain.json['nodes']);
    expect(fin.json['animations']).toEqual(plain.json['animations']);
    const mats = list(fin.json, 'materials').map((m) => m['name']);
    expect(mats.at(-1)).toBe('ts23d_finish');
    // Meshes of the LOD1/2 trees: same accessors' bytes, same materials.
    const lod0 = new Set<number>();
    const walk = (n: number): void => {
      const node = list(fin.json, 'nodes')[n];
      if (typeof node?.['mesh'] === 'number') lod0.add(node['mesh']);
      for (const c of (node?.['children'] as number[] | undefined) ?? []) walk(c);
    };
    walk(0);
    const bytes = (g: typeof fin, acc: number): Uint8Array => {
      const a = list(g.json, 'accessors')[acc] ?? {};
      const v = list(g.json, 'bufferViews')[a['bufferView'] as number] ?? {};
      const at = (v['byteOffset'] as number | undefined) ?? 0;
      return g.bin.subarray(at, at + (v['byteLength'] as number));
    };
    let swapped = 0;
    list(fin.json, 'meshes').forEach((m, i) => {
      const p = list(m, 'primitives')[0] ?? {};
      const q = list(list(plain.json, 'meshes')[i] ?? {}, 'primitives')[0] ?? {};
      if (lod0.has(i)) {
        if (p['material'] !== q['material']) swapped++;
        const pos = (x: J): number => (x['attributes'] as J)['POSITION'] as number;
        const at = list(fin.json, 'accessors')[pos(p)];
        const bt = list(plain.json, 'accessors')[pos(q)];
        expect([at?.['min'], at?.['max']]).toEqual([bt?.['min'], bt?.['max']]);
        return;
      }
      expect(p['material']).toBe(q['material']);
      for (const k of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0'])
        expect(bytes(fin, (p['attributes'] as J)[k] as number)).toEqual(
          bytes(plain, (q['attributes'] as J)[k] as number),
        );
    });
    expect(swapped).toBe(3); // bed + two wheels; the glass lamp keeps its material
  });
});

describe('httpFinish', () => {
  it('rejects a non-URL endpoint, an HTTP error and a malformed reply', async () => {
    expect(() => httpFinish({ endpoint: 'localhost:8188' })).toThrow('T3D_FINISH_INVALID');
    const reply = (ok: boolean, body: unknown) => () =>
      Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
    const lod0 = compile(cart, { lod: 0 });
    for (const f of [reply(false, {}), reply(true, { images: 'nope' })])
      await expect(
        finishAsset(lod0, {
          ...SMALL,
          prompt: 'x',
          model: httpFinish({ endpoint: 'http://x/y', fetch: f }),
        }),
      ).rejects.toThrow('T3D_FINISH_MODEL');
  });

  it('posts the control maps and bakes the reply', async () => {
    const mock = mockFinish();
    let sent: J = {};
    const model = httpFinish({
      endpoint: 'http://127.0.0.1:9/finish',
      model: 'sdxl-cn',
      fetch: async (_url, init) => {
        sent = JSON.parse(init.body) as J;
        return { ok: true, status: 200, json: async () => ({ images: [] as string[] }) };
      },
    });
    const lod0 = compile(cart, { lod: 0 });
    await expect(finishAsset(lod0, { ...SMALL, prompt: 'rust', model })).rejects.toThrow(
      'T3D_FINISH_MODEL',
    );
    const view = list(sent, 'views')[0] ?? {};
    expect([sent['prompt'], sent['model'], list(sent, 'views').length]).toEqual([
      'rust',
      'sdxl-cn',
      6,
    ]);
    expect(Object.keys((view['maps'] as J) ?? {})).toEqual([
      'depth',
      'normal',
      'normal_world',
      'part',
      'uv',
      'albedo',
    ]);
    const good = httpFinish({
      endpoint: 'http://127.0.0.1:9/finish',
      fetch: async (_u, init) => {
        const req = JSON.parse(init.body) as J;
        expect(req['seed']).toBe(1);
        const r = await finishAsset(lod0, { ...SMALL, prompt: 'rust', model: mock });
        return {
          ok: true,
          status: 200,
          json: async () => ({ images: r.images.map((b) => Buffer.from(b).toString('base64')) }),
        };
      },
    });
    const r = await finishAsset(lod0, { ...SMALL, prompt: 'rust', model: good });
    expect(r.findings).toEqual([]);
    expect(r.provenance.model).toBe('http:default@http://127.0.0.1:9/finish');
  });
});
