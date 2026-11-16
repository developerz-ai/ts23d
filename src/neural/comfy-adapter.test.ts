// comfyAdapter against an in-process fake ComfyUI (Bun.serve, port 0): no network.

import { afterAll, describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { jobKey, runJob } from './adapter.ts';
import { comfyAdapter, fillWorkflow } from './comfy-adapter.ts';
import { mockAdapter } from './mock-adapter.ts';

const REQ = { seed: 7, prompt: 'mossy stone', width: 4, height: 4 };
const png = (await mockAdapter().run({ task: 'image', request: REQ })).result.outputs[0]?.bytes;
const WORKFLOW = {
  '3': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: 20 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'photo of {{prompt}}, 4k' } },
  '9': { class_type: 'SaveImage', inputs: {} },
};

let queued: unknown;
let historyStatus = 'success';
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/prompt') {
      queued = await req.json();
      return Response.json({ prompt_id: 'p1' });
    }
    if (u.pathname === '/history/p1')
      return Response.json({
        p1: {
          status: { status_str: historyStatus },
          outputs: { '9': { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } },
        },
      });
    if (u.pathname === '/view' && u.searchParams.get('filename') === 'a.png')
      return new Response(new Blob([new Uint8Array(png ?? [])]), {
        headers: { 'content-type': 'image/png' },
      });
    return new Response('no', { status: 404 });
  },
});
afterAll(() => {
  server.stop(true);
});
const url = server.url.href;

describe('comfyAdapter', () => {
  test('a failed prompt → T3D_NEURAL_FAILED; conditioned jobs are refused', async () => {
    historyStatus = 'error';
    const a = comfyAdapter({ url, workflow: WORKFLOW, outputs: ['9'], pollMs: 1 });
    const e = await runJob(a, { task: 'image', request: REQ }).catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_NEURAL_FAILED');
    historyStatus = 'success';
    const control = [{ sha256: 'a'.repeat(64), mime: 'image/png' }];
    const e2 = await a
      .run({ task: 'image', request: { ...REQ, control } })
      .catch((x: unknown) => x);
    expect(e2 instanceof Ts23dError && e2.code).toBe('T3D_NEURAL_FAILED');
  });

  test('fills placeholders, maps the named output node to image outputs', async () => {
    const a = comfyAdapter({ url, workflow: WORKFLOW, outputs: ['9'], pollMs: 1, licence: 'MIT' });
    const run = await runJob(a, { task: 'image', request: REQ });
    expect(run.result.outputs.length).toBe(1);
    expect(queued).toEqual({
      prompt: fillWorkflow(WORKFLOW, REQ),
    });
    expect(fillWorkflow(WORKFLOW, REQ)).toMatchObject({
      '3': { inputs: { seed: 7 } },
      '6': { inputs: { text: 'photo of mossy stone, 4k' } },
    });
    const [m] = await a.models();
    const edited = comfyAdapter({ url, workflow: { ...WORKFLOW, '4': {} }, outputs: ['9'] });
    const [m2] = await edited.models();
    if (!m || !m2) throw new Error('no model');
    expect(jobKey('image', REQ, m)).not.toBe(jobKey('image', REQ, m2));
  });
});
