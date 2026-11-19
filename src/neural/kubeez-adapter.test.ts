// kubeezAdapter against an in-process fake of the Kubeez API (Bun.serve, port 0): no network.

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { encodePng, Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { aspectOf, KUBEEZ_TERMS, kubeezAdapter } from './kubeez-adapter.ts';
import { readPng } from './png-read.ts';
import { neuralCache } from './recipe-cache.ts';
import { recordJson } from './record.ts';
import { sha256Hex } from './sha256.ts';

const KEY = 'sk_live_secret123';
const PNG8 = encodePng(8, 8, new Uint8Array(8 * 8 * 4).fill(200));
const REQ = { seed: 9, prompt: 'cobblestone', width: 4, height: 4 };

interface Seen {
  path: string;
  key: string | null;
  body: string;
}
let seen: Seen[] = [];
let script: { generate: number[]; polls: unknown[]; upload: number } = {
  generate: [],
  polls: [],
  upload: 200,
};
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req): Promise<Response> {
    const u = new URL(req.url);
    const body = req.method === 'POST' ? await req.text() : '';
    seen.push({ path: u.pathname, key: req.headers.get('x-api-key'), body });
    if (u.pathname === '/v1/models')
      return Response.json({
        models: [
          {
            model_id: 'nano',
            generation_types: ['text-to-image', 'image-to-image'],
            cost_per_generation: 2,
          },
          { model_id: 'flux', generation_types: ['text-to-image'] },
          { model_id: 'veo', generation_types: ['text-to-video'] },
        ],
      });
    if (u.pathname === '/v1/upload/media')
      return script.upload === 200
        ? Response.json({ success: true, urls: [`${origin}/cdn/src.png`] })
        : new Response('no', { status: script.upload });
    if (u.pathname === '/v1/generate/media') {
      const status = script.generate.shift() ?? 200;
      if (status === 429) return new Response('{"error":"rate_limit_exceeded"}', { status: 429 });
      if (status === 403) return Response.json({ detail: 'missing scope' }, { status: 403 });
      return Response.json({ generation_id: 'g1', status: 'pending' });
    }
    if (u.pathname === '/v1/generate/media/g1')
      return Response.json(script.polls.shift() ?? { status: 'processing' });
    if (u.pathname === '/cdn/out.png')
      return new Response(new Blob([new Uint8Array(PNG8)]), {
        headers: { 'content-type': 'image/png' },
      });
    return new Response('no', { status: 404 });
  },
});
const origin = server.url.origin;
afterAll(() => {
  server.stop(true);
});
beforeEach(() => {
  seen = [];
  script = { generate: [], polls: [], upload: 200 };
});
const opts = { apiKey: KEY, baseUrl: server.url.origin, pollMs: 1, backoffMs: 1 };
const done = (url: string | null) => ({ status: 'completed', outputs: [{ url }] });
const err = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};

describe('kubeezAdapter: failures first', () => {
  test('no API key → T3D_NEURAL_FAILED naming KUBEEZ_API_KEY', () => {
    const e = (() => {
      try {
        kubeezAdapter({ apiKey: undefined });
      } catch (x) {
        return x;
      }
    })();
    expect(e instanceof Ts23dError && e.code).toBe('T3D_NEURAL_FAILED');
    expect(e instanceof Ts23dError && e.fix).toContain('KUBEEZ_API_KEY');
  });
  test('403 missing scope → T3D_NEURAL_FAILED, fix names generate:media, key never shown', async () => {
    script.generate = [403];
    const e = await err(runJob(kubeezAdapter(opts), { task: 'image', request: REQ }));
    expect(e.code).toBe('T3D_NEURAL_FAILED');
    expect(e.fix).toContain('generate:media');
    expect(`${e.message}${e.fix}`).not.toContain(KEY);
  });
  test('a failed generation → T3D_NEURAL_FAILED with its reason', async () => {
    script.polls = [{ status: 'processing' }, { status: 'failed', error_message: 'NSFW filter' }];
    const e = await err(runJob(kubeezAdapter(opts), { task: 'image', request: REQ }));
    expect([e.code, e.message.includes('NSFW filter')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
  test('429 past the job deadline → T3D_NEURAL_FAILED', async () => {
    script.generate = Array(50).fill(429);
    const a = kubeezAdapter({ ...opts, backoffMs: 5, jobTimeoutMs: 20 });
    const e = await err(runJob(a, { task: 'image', request: REQ }));
    expect([e.code, e.message.includes('429')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
});

describe('kubeezAdapter: the API', () => {
  test('429 backoff, pending → null url → url, PNG fitted, cached with licence own + terms', async () => {
    script.generate = [429, 429, 200];
    script.polls = [{ status: 'pending' }, done(null), done(`${server.url.origin}/cdn/out.png`)];
    const a = kubeezAdapter(opts);
    expect((await a.models()).map((m) => [m.id, m.cost])).toEqual([
      ['nano', 2],
      ['flux', undefined],
    ]);
    const cache = neuralCache({ recipe: 'street' });
    const { entry } = await cache.fill(a, { task: 'image', request: REQ });
    const png = readPng(entry.outputs[0]?.bytes ?? new Uint8Array(), 'out');
    expect([png.width, png.height]).toEqual([4, 4]);
    const gen = seen.filter((s) => s.path === '/v1/generate/media');
    expect(gen.length).toBe(3);
    expect(JSON.parse(gen[2]?.body ?? '{}')).toMatchObject({
      prompt: 'cobblestone',
      model: 'nano',
      generation_type: 'text-to-image',
      aspect_ratio: '1:1',
      seed: 9,
      output_format: 'png',
    });
    expect(seen.filter((s) => s.path.startsWith('/v1/')).every((s) => s.key === KEY)).toBe(true);
    expect(seen.find((s) => s.path === '/cdn/out.png')?.key).toBeNull();
    const rec = entry.record;
    expect([rec.adapter, rec.model.id, rec.model.licence, rec.model.terms]).toEqual([
      'kubeez',
      'nano',
      'own',
      KUBEEZ_TERMS,
    ]);
    expect(recordJson(rec)).not.toContain(KEY);
    expect(recordJson(rec)).not.toContain('cost');
  });

  test('control images are uploaded (multipart) and sent as image-to-image sources', async () => {
    script.polls = [done(`${server.url.origin}/cdn/out.png`)];
    const src = encodePng(2, 2, new Uint8Array(16).fill(9));
    const sha = sha256Hex(src);
    await runJob(kubeezAdapter(opts), {
      task: 'image',
      request: { ...REQ, width: 16, height: 9, control: [{ sha256: sha, mime: 'image/png' }] },
      inputs: new Map([[sha, src]]),
    });
    const up = seen.find((s) => s.path === '/v1/upload/media');
    expect(up?.body).toContain('name="file"');
    const gen = JSON.parse(seen.find((s) => s.path === '/v1/generate/media')?.body ?? '{}');
    expect(gen).toMatchObject({
      generation_type: 'image-to-image',
      aspect_ratio: '16:9',
      source_media_urls: [`${server.url.origin}/cdn/src.png`],
    });
  });

  test('paid: estimate is the listed cost_per_generation, NaN when the model lists none', async () => {
    const a = kubeezAdapter(opts);
    expect(a.paid).toBe(true);
    const job = { task: 'image' as const, request: REQ };
    expect(await a.estimate?.(job)).toBe(2);
    expect(await a.estimate?.({ ...job, model: 'flux' })).toBeNaN();
    expect(seen.some((s) => s.path === '/v1/generate/media')).toBe(false);
  });

  test('aspectOf picks the closest listed ratio', () => {
    expect([
      aspectOf(1024, 1024),
      aspectOf(1920, 1080),
      aspectOf(900, 1200),
      aspectOf(2100, 900),
    ]).toEqual(['1:1', '16:9', '3:4', '21:9']);
  });
});
