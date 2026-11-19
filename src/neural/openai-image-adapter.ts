// openaiImageAdapter: the `image` task on any OpenAI-compatible POST <url>/v1/images/generations
// endpoint (hosted or local: LocalAI, vLLM-style servers, diffusers wrappers). Sends { model,
// prompt, negative_prompt?, n: 1, size: 'WxH', seed, response_format: 'b64_json', ...params } and
// reads data[i].b64_json as PNG. Keys go in `headers` (the caller's, never the environment).
// Servers that ignore `seed` are not reproducible: the committed cache is what makes the build so.

import type { NeuralOutput } from '../core/index.ts';
import {
  fieldsOf,
  inputsOf,
  type NeuralAdapter,
  type NeuralBinding,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import {
  checkWire,
  DEFAULT_MAX_BYTES,
  failed,
  fromBase64,
  type WireFetch,
  wireJson,
} from './wire.ts';

export interface OpenAiImageOptions {
  /** API root without /v1, e.g. 'https://api.example.com' or 'http://127.0.0.1:8080'. */
  readonly url: string;
  readonly model: string;
  /** Licence / terms of the provider's outputs: recorded, never gated. */
  readonly licence?: string;
  /** e.g. { authorization: `Bearer ${key}` }. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Set for a billed endpoint: `t3d neural run` then asks for --yes-spend, since this API lists
   *  no price. Default false (a local server). */
  readonly paid?: boolean;
  /** Whole request, ms. Default 300 000. */
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly fetch?: WireFetch;
}

export function openaiImageAdapter(o: OpenAiImageOptions): NeuralAdapter {
  const url = o.url.replace(/\/+$/, '').replace(/\/v1$/, '');
  if (!/^https?:\/\/[^/]/.test(url))
    failed(`'${o.url}' is not an http(s) URL`, 'pass the API root, e.g. http://127.0.0.1:8080');
  const wire = {
    timeoutMs: o.timeoutMs ?? 300_000,
    maxBytes: o.maxBytes ?? DEFAULT_MAX_BYTES,
    ...(o.headers ? { headers: o.headers } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
  };
  checkWire(wire);
  const id = `openai-image:${url}`;
  const model: NeuralModelInfo = {
    id: o.model,
    task: 'image',
    licence: o.licence ?? 'per the provider terms (not declared: set licence)',
  };
  return {
    id,
    tasks: ['image'],
    ...(o.paid ? { paid: true } : {}),
    models: () => Promise.resolve([model]),
    async run(job) {
      pickModel(id, [model], job.task, job.model);
      if (job.task !== 'image' || inputsOf(job.task, job.request).length > 0)
        failed(
          `${id} runs unconditioned image jobs only`,
          'use the t3d-neural/1 http adapter for control maps',
        );
      const r = fieldsOf(job.request);
      const reply = (await wireJson(wire, `${url}/v1/images/generations`, 'generate image', {
        ...(r['params'] as object | undefined),
        model: o.model,
        prompt: r['prompt'],
        ...(typeof r['negative'] === 'string' ? { negative_prompt: r['negative'] } : {}),
        n: 1,
        size: `${String(r['width'])}x${String(r['height'])}`,
        seed: r['seed'],
        response_format: 'b64_json',
      })) as { data?: { b64_json?: unknown }[] } | null;
      const data = reply?.data;
      if (!Array.isArray(data) || data.length === 0)
        failed(`${url} answered no data[]`, 'the endpoint must support response_format: b64_json');
      const outputs: NeuralOutput[] = data.map((d, i) => {
        if (typeof d?.b64_json !== 'string')
          failed(
            `${url} data[${i}] has no b64_json`,
            'the endpoint must support response_format: b64_json',
          );
        return { bytes: fromBase64(d.b64_json as string, `${url} data[${i}]`), mime: 'image/png' };
      });
      return { result: taskResult(job.task, outputs), model };
    },
  };
}

/** Config shorthand: `neural: { image: openaiImage(url, 'sdxl', { headers }) }`. */
export const openaiImage = (
  url: string,
  model: string,
  o: Omit<OpenAiImageOptions, 'url' | 'model'> = {},
): NeuralBinding => openaiImageAdapter({ ...o, url, model });
