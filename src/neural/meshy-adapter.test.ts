// meshyAdapter against a fake fetch of the Meshy API: no network, no real key, no credits. The
// fake answers only the made-up hosts below; any other URL (api.meshy.ai above all) is recorded
// as stray and fails the run, so these tests can never reach the real service. Every adapter gets
// an in-memory pending store, so no test writes to $TS23D_HOME.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { cube } from './fixtures.ts';
import { writeMeshGlb } from './glb-write.ts';
import { MESHY_TERMS, meshyAdapter } from './meshy-adapter.ts';
import { FAKE_API, FAKE_CDN, type FakeReply, fakeMeshy } from './meshy-fake.ts';
import { memoryPending } from './meshy-net.ts';
import type { MeshyOptions } from './meshy-params.ts';
import { neuralCache } from './recipe-cache.ts';
import { recordJson } from './record.ts';
import { sha256Hex } from './sha256.ts';

const KEY = 'msy_fake_secret_key_123';
const API = FAKE_API;
const CDN = FAKE_CDN;
const GLB = writeMeshGlb([{ name: 'm', mesh: cube() }]);
const IMG = encodePng(32, 32, new Uint8Array(32 * 32 * 4).fill(180));
const IMG_SHA = sha256Hex(IMG);
const IMAGE_REQ = { seed: 1, image: { sha256: IMG_SHA, mime: 'image/png' }, maxTriangles: 500 };
const inputs = new Map([[IMG_SHA, IMG]]);

const fakeApi = fakeMeshy();
const fake = fakeApi.fetch;
const { seen, stray } = fakeApi;
let script = fakeApi.script;

afterAll(() => {
  expect(stray).toEqual([]);
});
beforeEach(() => {
  fakeApi.reset(GLB);
  script = fakeApi.script;
});
const opts = (more: Partial<MeshyOptions> = {}): MeshyOptions => ({
  apiKey: KEY,
  baseUrl: API,
  fetch: fake,
  pollMs: 1,
  backoffMs: 1,
  pending: memoryPending(),
  ...more,
});
const done = (glb: unknown = `${CDN}/out/model.glb?Expires=1`, credits = 20): FakeReply => ({
  body: { status: 'SUCCEEDED', consumed_credits: credits, model_urls: { glb } },
});
const err = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};
const noKey = (e: Ts23dError): void => {
  expect(`${e.message}${e.fix}${JSON.stringify(e)}`).not.toContain(KEY);
};
const image = (o: MeshyOptions, request: object = IMAGE_REQ) =>
  runJob(meshyAdapter(o), { task: 'mesh', request: request as typeof IMAGE_REQ, inputs });
const posts = fakeApi.posts;

describe('meshyAdapter: failures first', () => {
  test('guard: the test fetch refuses the real api.meshy.ai (no credits spent by tests)', async () => {
    const { baseUrl: _b, ...real } = opts();
    const e = await err(image(real));
    expect(e.message).toContain('refused a real host');
    noKey(e);
    expect(stray.splice(0)).toEqual([
      'https://api.meshy.ai/openapi/v1/image-to-3d?page_size=10&sort_by=-created_at',
    ]);
  });
  test('no API key → T3D_NEURAL_FAILED naming MESHY_API_KEY', () => {
    for (const apiKey of [undefined, ''])
      expect(() => meshyAdapter({ apiKey })).toThrow(
        expect.objectContaining({
          code: 'T3D_NEURAL_FAILED',
          fix: expect.stringContaining('MESHY_API_KEY'),
        }),
      );
  });
  test('a FAILED task → its reason, refunded, pending entry dropped, key never shown', async () => {
    const pending = memoryPending();
    script.polls = [
      { body: { status: 'PENDING' } },
      {
        body: {
          status: 'FAILED',
          task_error: { type: 'invalid_input', message: 'image too complex' },
        },
      },
    ];
    const e = await err(image(opts({ pending })));
    expect([
      e.code,
      e.message.includes('image too complex'),
      e.message.includes('refunded'),
    ]).toEqual(['T3D_NEURAL_FAILED', true, true]);
    expect(pending.map.size).toBe(0);
    noKey(e);
  });
  test('402 → fix explains credits / paid plan, key never shown', async () => {
    script.create = [{ status: 402, body: { message: 'Insufficient credits' } }];
    const e = await err(image(opts()));
    expect([e.code, e.fix.includes('paid plan')]).toEqual(['T3D_NEURAL_FAILED', true]);
    noKey(e);
  });
  test('timeout keeps the task id; a rerun resumes polling it with no new POST (no double charge)', async () => {
    const pending = memoryPending();
    const e = await err(image(opts({ pending, jobTimeoutMs: 20 })));
    expect([e.code, e.fix.includes('resume polling task i-1')]).toEqual([
      'T3D_NEURAL_FAILED',
      true,
    ]);
    expect([...pending.map.values()]).toEqual(['i-1']);
    expect(JSON.stringify([...pending.map])).not.toContain(KEY);
    seen.length = 0;
    script.polls = [done()];
    await image(opts({ pending }));
    expect(posts('v1/image-to-3d')).toEqual([]);
    expect(seen.some((s) => s.url === `${API}/openapi/v1/image-to-3d/i-1`)).toBe(true);
    // Only the memo "these bytes came from task i-1" stays (a later rig names the task).
    expect([...pending.map]).toEqual([[`glb:${sha256Hex(GLB)}`, 'i-1']]);
  });
  test('a resumed task that is gone (404) → entry dropped, fix says a rerun creates a new one', async () => {
    const pending = memoryPending();
    await err(image(opts({ pending, jobTimeoutMs: 20 })));
    script.gone = ['i-1'];
    const e = await err(image(opts({ pending })));
    expect([e.message.includes('404'), e.fix.includes('new task')]).toEqual([true, true]);
    expect(pending.map.size).toBe(0);
  });
  test('rate-limit 429 past the deadline → T3D_NEURAL_FAILED "rate limited"', async () => {
    script.create = Array(200).fill({ status: 429, body: { message: 'Rate limit exceeded' } });
    const e = await err(image(opts({ backoffMs: 5, jobTimeoutMs: 30 })));
    expect([e.code, e.message.includes('rate limited')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
  test('NoMorePendingTasks 429 past the deadline → fix names the plan concurrency', async () => {
    script.create = Array(200).fill({ status: 429, body: { message: 'NoMorePendingTasks' } });
    const e = await err(image(opts({ backoffMs: 5, jobTimeoutMs: 30 })));
    expect([
      e.message.includes('too many pending tasks'),
      e.fix.includes('concurrent tasks'),
    ]).toEqual([true, true]);
  });
  test('a GLB that does not parse → T3D_NEURAL_OUTPUT_INVALID (runJob validation)', async () => {
    script.polls = [done()];
    script.file = new TextEncoder().encode('<html>expired link</html>');
    script.fileType = 'application/octet-stream';
    expect((await err(image(opts()))).code).toBe('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('a GLB over maxTriangles is refused', async () => {
    script.polls = [done()];
    const e = await err(image(opts(), { ...IMAGE_REQ, maxTriangles: 2 }));
    expect([e.code, e.message.includes('cap 2')]).toEqual(['T3D_NEURAL_OUTPUT_INVALID', true]);
  });
  test('SUCCEEDED without model_urls.glb, or an unsupported image type → T3D_NEURAL_FAILED', async () => {
    script.polls = [done(null)];
    expect((await err(image(opts()))).code).toBe('T3D_NEURAL_FAILED');
    const e = await err(
      image(opts(), { ...IMAGE_REQ, image: { sha256: IMG_SHA, mime: 'image/gif' } }),
    );
    expect(e.fix).toContain('image/png');
  });
});

describe('meshyAdapter: the API', () => {
  test('image-to-3d: both 429 kinds waited out, GLB only, no enhancement, keyless download, record', async () => {
    script.create = [
      { status: 429, body: { message: 'Rate limit exceeded' }, retryAfter: '0' },
      { status: 429, body: { message: 'NoMoreConcurrentTasks' } },
    ];
    script.polls = [{ body: { status: 'PENDING' } }, done()];
    const pending = memoryPending();
    const cache = neuralCache({ recipe: 'wolf' });
    const { entry } = await cache.fill(meshyAdapter(opts({ pending })), {
      task: 'mesh',
      request: IMAGE_REQ,
      inputs,
    });
    expect(entry.outputs[0]?.mime).toBe('model/gltf-binary');
    const body = JSON.parse(posts('v1/image-to-3d')[2]?.body ?? '{}');
    expect(body).toMatchObject({
      ai_model: 'latest',
      target_formats: ['glb'],
      image_enhancement: false,
      should_texture: false,
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 450,
    });
    expect(body.image_url.startsWith('data:image/png;base64,')).toBe(true);
    expect(seen.filter((s) => s.url.startsWith(API)).every((s) => s.auth === `Bearer ${KEY}`)).toBe(
      true,
    );
    expect(seen.find((s) => s.url.startsWith(CDN))?.auth).toBeUndefined();
    const rec = entry.record;
    expect([rec.adapter, rec.model.id, rec.model.licence, rec.model.terms, rec.server]).toEqual([
      'meshy',
      'latest',
      'own',
      MESHY_TERMS,
      'meshy task i-1; consumed_credits 20',
    ]);
    expect(recordJson(rec)).not.toContain(KEY);
    expect([...pending.map.keys()]).toEqual([`glb:${sha256Hex(GLB)}`]);
  });

  test('polls honour Retry-After over pollMs (else this test would wait 60 s)', async () => {
    script.polls = [{ body: { status: 'IN_PROGRESS' }, retryAfter: '0' }, done()];
    await image(opts({ pollMs: 60_000 }));
    expect(seen.filter((s) => s.url === `${API}/openapi/v1/image-to-3d/i-1`).length).toBe(2);
  });

  test('text-to-3d with texture: preview, then refine on the preview id with the texture knobs', async () => {
    script.polls = [done(undefined, 20), done(undefined, 10)];
    const o = opts({
      texture: true,
      pbr: true,
      textureResolution: '4k',
      textureModel: 'meshy-n1',
      poseMode: 'a-pose',
    });
    const run = await runJob(meshyAdapter(o), {
      task: 'mesh',
      request: { seed: 2, prompt: 'a wooden crate' },
    });
    const [preview, refine] = posts('v2/text-to-3d').map((s) => JSON.parse(s.body));
    expect(preview).toEqual({
      ai_model: 'latest',
      target_formats: ['glb'],
      pose_mode: 'a-pose',
      mode: 'preview',
      prompt: 'a wooden crate',
    });
    expect(refine).toEqual({
      mode: 'refine',
      preview_task_id: 't-1',
      texture_prompt: 'a wooden crate',
      target_formats: ['glb'],
      enable_pbr: true,
      texture_resolution: '4k',
      ai_model: 'meshy-n1',
    });
    expect(run.server).toMatch(/consumed_credits 30$/);
  });
});
