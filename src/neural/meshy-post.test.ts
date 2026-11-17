// The Meshy `texture` task (retexture on our UVs), the credit estimate and the balance call,
// against the fake API.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { meshyAdapter } from './meshy-adapter.ts';
import { FAKE_API, FAKE_CDN, fakeMeshy } from './meshy-fake.ts';
import { memoryPending } from './meshy-net.ts';
import { dataUri, MESHY_LIMITS, type MeshyOptions } from './meshy-params.ts';
import { sha256Hex } from './sha256.ts';

const api = fakeMeshy();
const MESH = writeMeshGlb([{ name: 'bust', mesh: cube() }]);
const SHA = sha256Hex(MESH);
const inputs = new Map([[SHA, MESH]]);
const PNG = encodePng(2048, 2048, new Uint8Array(2048 * 2048 * 4).fill(120));
const TEX = {
  seed: 1,
  mesh: { sha256: SHA, mime: 'model/gltf-binary' },
  prompt: 'weathered green skin',
  size: 2048,
};
const opts = (more: Partial<MeshyOptions> = {}): MeshyOptions => ({
  apiKey: 'msy_fake',
  baseUrl: FAKE_API,
  fetch: api.fetch,
  pollMs: 1,
  backoffMs: 1,
  pending: memoryPending(),
  ...more,
});
const maps = (...names: string[]) => ({
  body: {
    status: 'SUCCEEDED',
    consumed_credits: 10,
    texture_urls: [Object.fromEntries(names.map((n) => [n, `${FAKE_CDN}/${n}.png?sig=1`]))],
  },
});
const paint = (request: object = TEX, model?: string) =>
  runJob(meshyAdapter(opts()), {
    task: 'texture',
    request: request as typeof TEX,
    inputs,
    ...(model ? { model } : {}),
  });
const err = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};

afterAll(() => expect(api.stray).toEqual([]));
beforeEach(() => {
  api.reset(PNG);
  api.script.fileType = 'image/png';
});

describe('meshy texture: failures first', () => {
  test('sizes, models and inputs Meshy would refuse cost nothing', async () => {
    const cases: [object, string | undefined, RegExp][] = [
      [{ size: 1024 }, undefined, /size 1024 is not a Meshy texture resolution/],
      [{ size: 4096 }, 'meshy-6-lite', /2k textures only/],
      [{ params: { pbr: true } }, 'meshy-n1', /no PBR maps/],
      [{ prompt: ' ' }, undefined, /prompt has 0 characters/],
      [{ control: [TEX.mesh] }, undefined, /no control maps/],
      [{ params: { style: 'x' } }, undefined, /params\.style is not a Meshy knob/],
      // Fresh UVs would come back in a GLB this task does not return: no such switch.
      [{ params: { originalUv: false } }, undefined, /params\.originalUv is not a Meshy knob/],
    ];
    for (const [more, model, want] of cases)
      expect((await err(paint({ ...TEX, ...more }, model))).message).toMatch(want);
    expect(api.seen.filter((s) => s.method === 'POST')).toEqual([]);
  });
  test('a map of the wrong size is refused by runJob', async () => {
    api.script.polls = [maps('base_color')];
    api.script.file = encodePng(4, 4, new Uint8Array(64));
    expect((await err(paint())).code).toBe('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('uploads over the documented limits fail before any request, with a fix', () => {
    const image = { length: MESHY_LIMITS.imageBytes + 1 } as Uint8Array;
    expect(() => dataUri('mesh input image 0', image, 'image/png')).toThrow(/limit 20 MB/);
    // 76 MB of GLB is 101.3 MB once base64-encoded.
    const model = { length: 76 * 1024 * 1024 } as Uint8Array;
    expect(() => dataUri('rig mesh', model, 'application/octet-stream', true)).toThrow(
      /101\.3 MB as a data URI, limit 100 MB/,
    );
    expect(api.seen).toEqual([]);
  });
});

describe('meshy texture', () => {
  test('retexture keeps our UVs; PBR returns base colour, metallic, roughness, normal as PNG', async () => {
    api.script.polls = [maps('base_color', 'metallic', 'roughness', 'normal')];
    const run = await paint({ ...TEX, params: { pbr: true } });
    const body = JSON.parse(api.posts('v1/retexture')[0]?.body ?? '{}');
    expect(body).toMatchObject({
      text_style_prompt: 'weathered green skin',
      ai_model: 'latest',
      enable_original_uv: true,
      enable_pbr: true,
      texture_resolution: '2k',
      target_formats: ['glb'],
    });
    expect(body.model_url.startsWith('data:application/octet-stream;base64,')).toBe(true);
    expect(run.result.outputs.map((o) => o.mime)).toEqual(Array(4).fill('image/png'));
    expect(api.seen.slice(-4).map((s) => new URL(s.url).pathname)).toEqual([
      '/base_color.png',
      '/metallic.png',
      '/roughness.png',
      '/normal.png',
    ]);
    expect([run.model.licence, run.server]).toEqual(['own', 'meshy task x-1; consumed_credits 10']);
  });

  test('estimate per task, and balance (free calls only)', async () => {
    const a = meshyAdapter(opts());
    const image = { sha256: SHA, mime: 'image/png' };
    const mesh = (params?: Record<string, string | boolean>) =>
      a.estimate({ task: 'mesh', request: { seed: 1, image, ...(params ? { params } : {}) } });
    expect([
      mesh(),
      mesh({ texture: true, pbr: true, textureResolution: '2k' }),
      mesh({ texture: true, textureResolution: '8k', geometryResolution: '2k' }),
      a.estimate({ task: 'mesh', request: { seed: 1, image }, model: 'meshy-6-lite' }),
      a.estimate({ task: 'texture', request: TEX }),
      a.estimate({ task: 'texture', request: { ...TEX, size: 8192 } }),
      a.estimate({ task: 'rig', request: { seed: 1, mesh: TEX.mesh } }),
      a.estimate({ task: 'rig', request: { seed: 1, mesh: TEX.mesh, clips: ['a', 'b', 'c'] } }),
    ]).toEqual([20, 30, 40, 5, 10, 15, 5, 14]);
    expect(await a.balance()).toEqual({ balance: 1000, monthly: 600, permanent: 400 });
    expect(api.seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `GET ${FAKE_API}/openapi/v1/balance`,
    ]);
    api.script.balance = { message: 'nope' };
    expect((await err(a.balance())).message).toContain('no numeric `balance`');
  });
});
