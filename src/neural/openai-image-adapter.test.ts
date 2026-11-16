// openaiImageAdapter against an in-process fake /v1/images/generations (Bun.serve, port 0).

import { afterAll, describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { runJob } from './adapter.ts';
import { mockAdapter } from './mock-adapter.ts';
import { openaiImageAdapter } from './openai-image-adapter.ts';

const REQ = { seed: 4, prompt: 'brick wall', width: 4, height: 4, params: { quality: 'hd' } };
const png = (await mockAdapter().run({ task: 'image', request: REQ })).result.outputs[0]?.bytes;
let body: Record<string, unknown> = {};
let reply: unknown = { data: [{ b64_json: Buffer.from(png ?? []).toString('base64') }] };
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    if (new URL(req.url).pathname !== '/v1/images/generations' || !req.headers.get('authorization'))
      return new Response('no', { status: 401 });
    body = (await req.json()) as Record<string, unknown>;
    return Response.json(reply);
  },
});
afterAll(() => {
  server.stop(true);
});
const opts = { url: `${server.url.href}v1`, model: 'sdxl', headers: { authorization: 'Bearer k' } };

describe('openaiImageAdapter', () => {
  test('no b64_json, missing key → T3D_NEURAL_FAILED; non-PNG bytes → T3D_NEURAL_OUTPUT_INVALID', async () => {
    const code = (p: Promise<unknown>) =>
      p.then(
        () => 'ok',
        (e: unknown) => (e instanceof Ts23dError ? e.code : String(e)),
      );
    reply = { data: [{ url: 'https://x' }] };
    expect(await code(runJob(openaiImageAdapter(opts), { task: 'image', request: REQ }))).toBe(
      'T3D_NEURAL_FAILED',
    );
    const anon = openaiImageAdapter({ ...opts, headers: {} });
    expect(await code(runJob(anon, { task: 'image', request: REQ }))).toBe('T3D_NEURAL_FAILED');
    reply = { data: [{ b64_json: Buffer.from('GIF89a').toString('base64') }] };
    expect(await code(runJob(openaiImageAdapter(opts), { task: 'image', request: REQ }))).toBe(
      'T3D_NEURAL_OUTPUT_INVALID',
    );
  });

  test('sends model, prompt, size, seed and params; returns the PNG', async () => {
    reply = { data: [{ b64_json: Buffer.from(png ?? []).toString('base64') }] };
    const run = await runJob(openaiImageAdapter(opts), { task: 'image', request: REQ });
    expect(body).toMatchObject({
      model: 'sdxl',
      prompt: 'brick wall',
      size: '4x4',
      seed: 4,
      quality: 'hd',
    });
    expect(Buffer.from(run.result.outputs[0]?.bytes ?? []).equals(Buffer.from(png ?? []))).toBe(
      true,
    );
  });
});
