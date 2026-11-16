// httpAdapter against an in-process fake t3d-neural/1 server (Bun.serve on 127.0.0.1, port 0):
// no network. Hostile replies first, then the full submit → poll → cache round trip.

import { afterAll, describe, expect, test } from 'bun:test';
import { type NeuralRequest, Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { httpAdapter } from './http-adapter.ts';
import { mockAdapter } from './mock-adapter.ts';
import { neuralCache } from './recipe-cache.ts';

const REQ: NeuralRequest<'image'> = { seed: 2, prompt: 'bark', width: 4, height: 4 };
const pngBytes = (await mockAdapter().run({ task: 'image', request: REQ })).result.outputs[0]
  ?.bytes;
const png = Buffer.from(pngBytes ?? new Uint8Array()).toString('base64');

const MODELS = [
  { id: 'sdxl', task: 'image', licence: 'CC0-1.0', weightsSha256: 'f'.repeat(64), vramGb: 12 },
];
const json = (v: unknown, init: ResponseInit = {}): Response =>
  Response.json(v, { ...init, headers: { 'content-type': 'application/json', ...init.headers } });

/** Behaviour per route; tests swap `job` and `poll`. */
const state = {
  posts: 0,
  polls: 0,
  models: (): Response => json(MODELS),
  job: (): Response => json({ id: 'j1' }),
  poll: (): Response | Promise<Response> =>
    json({ status: 'done', server: 'fake/1', outputs: [{ mime: 'image/png', data: png }] }),
};
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === '/v1/models') return state.models();
    if (path === '/v1/jobs' && req.method === 'POST') {
      state.posts++;
      return state.job();
    }
    if (path === '/v1/jobs/j1') {
      state.polls++;
      return state.poll();
    }
    return new Response('no', { status: 404 });
  },
});
afterAll(() => {
  server.stop(true);
});
const url = server.url.href;
const reset = (): void => {
  state.models = () => json(MODELS);
  state.job = () => json({ id: 'j1' });
  state.poll = () =>
    json({ status: 'done', server: 'fake/1', outputs: [{ mime: 'image/png', data: png }] });
};

const fails = async (p: Promise<unknown>): Promise<Ts23dError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x,
  );
  if (!(e instanceof Ts23dError)) throw new Error(`expected a Ts23dError, got ${String(e)}`);
  return e;
};
const job = { task: 'image' as const, request: REQ };

describe('httpAdapter: hostile servers (failure first)', () => {
  test('wrong output mime → T3D_NEURAL_OUTPUT_INVALID', async () => {
    reset();
    state.poll = () => json({ status: 'done', outputs: [{ mime: 'image/webp', data: png }] });
    const e = await fails(runJob(httpAdapter({ url, pollMs: 1 }), job));
    expect(e.code).toBe('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('a reply that is not JSON → T3D_NEURAL_OUTPUT_INVALID', async () => {
    reset();
    state.models = () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
    const e = await fails(httpAdapter({ url }).models());
    expect(e.code).toBe('T3D_NEURAL_OUTPUT_INVALID');
  });
  test('an oversize reply is refused → T3D_NEURAL_OUTPUT_INVALID', async () => {
    reset();
    const e = await fails(runJob(httpAdapter({ url, pollMs: 1, maxBytes: 200 }), job));
    expect([e.code, e.message.includes('cap 200')]).toEqual(['T3D_NEURAL_OUTPUT_INVALID', true]);
  });
  test('HTTP 500 → T3D_NEURAL_FAILED with a fix', async () => {
    reset();
    state.job = () => new Response('boom', { status: 500 });
    const e = await fails(runJob(httpAdapter({ url }), job));
    expect(e.code).toBe('T3D_NEURAL_FAILED');
    expect(e.fix).toContain('server log');
  });
  test('a failed job → T3D_NEURAL_FAILED naming the job', async () => {
    reset();
    state.poll = () => json({ status: 'failed', error: 'CUDA out of memory' });
    const e = await fails(runJob(httpAdapter({ url, pollMs: 1 }), job));
    expect([e.code, e.message.includes('CUDA out of memory')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
  test('a request that never answers → T3D_NEURAL_FAILED within timeoutMs', async () => {
    reset();
    state.poll = () => new Promise<Response>(() => {});
    const e = await fails(runJob(httpAdapter({ url, timeoutMs: 50, pollMs: 1 }), job));
    expect([e.code, e.fix.includes('timeoutMs')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
  test('a job that stays queued → T3D_NEURAL_FAILED after jobTimeoutMs', async () => {
    reset();
    state.poll = () => json({ status: 'queued' });
    const e = await fails(runJob(httpAdapter({ url, jobTimeoutMs: 30, pollMs: 5 }), job));
    expect([e.code, e.fix.includes('jobTimeoutMs')]).toEqual(['T3D_NEURAL_FAILED', true]);
  });
  test('an unknown model and a bad URL → T3D_NEURAL_FAILED', async () => {
    reset();
    const e = await fails(runJob(httpAdapter({ url }), { ...job, model: 'flux' }));
    expect([e.code, e.fix.includes('sdxl')]).toEqual(['T3D_NEURAL_FAILED', true]);
    expect(() => httpAdapter({ url: 'gpu:8190' })).toThrow('T3D_NEURAL_FAILED');
  });
});

describe('httpAdapter: the protocol', () => {
  test('says once per change why a queued job waits (D54: GPU held by another process)', async () => {
    reset();
    const replies = [
      { status: 'queued', position: 1 },
      { status: 'queued', position: 0, waiting: 'gpu busy: pid 4242 pixal3d' },
      { status: 'queued', position: 0, waiting: 'gpu busy: pid 4242 pixal3d' },
      { status: 'running' },
      { status: 'done', outputs: [{ mime: 'image/png', data: png }] },
    ];
    let n = 0;
    state.poll = () => json(replies[Math.min(n++, replies.length - 1)]);
    const said: string[] = [];
    const a = httpAdapter({ url, pollMs: 1, onWait: (m) => said.push(m) });
    await a.run(job);
    const root = url.replace(/\/+$/, '');
    expect(said).toEqual([
      `sdxl @ ${root}: job j1 queued (1 ahead)`,
      `sdxl @ ${root}: job j1 queued: gpu busy: pid 4242 pixal3d`,
    ]);
  });

  test('lists models, submits, polls and fills the recipe cache once', async () => {
    reset();
    state.posts = 0;
    let n = 0;
    state.poll = () =>
      ++n < 3
        ? json({ status: 'running' })
        : json({ status: 'done', server: 'fake/1', outputs: [{ mime: 'image/png', data: png }] });
    const a = httpAdapter({ url, pollMs: 1 });
    expect(JSON.stringify((await a.models())[0])).toBe(JSON.stringify(MODELS[0]));
    const cache = neuralCache({ recipe: 'oak' });
    const first = await cache.fill(a, job);
    const again = await cache.fill(a, job);
    expect([first.cached, again.cached, state.posts]).toEqual([false, true, 1]);
    expect(first.entry.record.server).toBe('fake/1');
    expect(first.entry.record.model.weightsSha256).toBe('f'.repeat(64));
    expect(cache.get('image', REQ).fallback).toBe(false);
  });
});
