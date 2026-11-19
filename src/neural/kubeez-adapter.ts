// kubeezAdapter: the `image` task on kubeez.com, a hosted service, for users without a GPU. ts23d
// works with Kubeez as a partner (disclosed in README and docs/idea/08); any other adapter works
// the same way. Text-to-image, or image-to-image when the request carries `control` images (each
// uploaded first through POST /v1/upload/media). POST /v1/generate/media → generation_id; poll
// GET /v1/generate/media/{id} until `completed` with every outputs[].url set (the CDN may lag) or
// `failed`; download each PNG (WITHOUT the API key: the CDN is another host) and fit it to the
// asked width × height. HTTP 429 backs off within the job deadline. The key is the caller's
// (`apiKey`: pass process.env.KUBEEZ_API_KEY in t3d.config.ts); it goes only into request headers,
// never into records, caches, logs or errors. Paid: `estimate` is the model's listed
// cost_per_generation, so `t3d neural run` prices jobs before sending them. Outputs: "you retain the rights to outputs generated
// using your prompts, subject to third-party rights" (Kubeez terms) → licence 'own' + terms URL.

import type { NeuralOutput } from '../core/index.ts';
import {
  fieldsOf,
  inputsOf,
  type NeuralAdapter,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import { fitPng } from './png-fit.ts';
import { sha256Hex } from './sha256.ts';
import {
  checkWire,
  DEFAULT_MAX_BYTES,
  failed,
  pause,
  type WireFetch,
  wireBytes,
  wireJson,
} from './wire.ts';

export const KUBEEZ_TERMS = 'https://kubeez.com/legal/terms';

export interface KubeezOptions {
  /** `sk_live_…`. Required; read it from the environment in t3d.config.ts, not here. */
  readonly apiKey: string | undefined;
  /** Preferred model id (listed first, so it is the default); else the API's first image model. */
  readonly model?: string;
  /** Default 'https://api.kubeez.com'. */
  readonly baseUrl?: string;
  /** '1K' | '2K' | '4K' for models that take it. */
  readonly resolution?: string;
  readonly timeoutMs?: number;
  /** Whole job incl. queue, rate-limit backoff and download, ms. Default 600 000. */
  readonly jobTimeoutMs?: number;
  readonly pollMs?: number;
  readonly backoffMs?: number;
  readonly maxBytes?: number;
  readonly fetch?: WireFetch;
}

const RATIOS = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'];

/** The listed aspect ratio closest to width / height. */
export function aspectOf(width: number, height: number): string {
  const r = Math.log(width / height);
  const d = (s: string): number => {
    const [a, b] = s.split(':').map(Number);
    return Math.abs(Math.log((a ?? 1) / (b ?? 1)) - r);
  };
  return RATIOS.reduce((best, s) => (d(s) < d(best) ? s : best));
}

function multipart(bytes: Uint8Array, mime: string): { raw: Uint8Array; type: string } {
  const b = `t3d${sha256Hex(bytes).slice(0, 24)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="input.${mime.split('/')[1] ?? 'bin'}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${b}--\r\n`);
  const raw = new Uint8Array(head.length + bytes.length + tail.length);
  raw.set(head);
  raw.set(bytes, head.length);
  raw.set(tail, head.length + bytes.length);
  return { raw, type: `multipart/form-data; boundary=${b}` };
}

type Status = { status?: unknown; error_message?: unknown; outputs?: { url?: unknown }[] } | null;

export function kubeezAdapter(o: KubeezOptions): NeuralAdapter {
  if (!o.apiKey)
    failed(
      'kubeezAdapter has no API key',
      'set KUBEEZ_API_KEY and pass apiKey: process.env.KUBEEZ_API_KEY',
    );
  const base = `${(o.baseUrl ?? 'https://api.kubeez.com').replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`;
  if (!/^https?:\/\/[^/]/.test(base))
    failed(`'${o.baseUrl}' is not an http(s) URL`, 'pass baseUrl like https://api.kubeez.com');
  const jobMs = o.jobTimeoutMs ?? 600_000;
  const shared = {
    timeoutMs: o.timeoutMs ?? 60_000,
    maxBytes: o.maxBytes ?? DEFAULT_MAX_BYTES,
    ...(o.fetch ? { fetch: o.fetch } : {}),
  };
  checkWire(shared);
  const api = {
    ...shared,
    headers: { 'x-api-key': o.apiKey ?? '' },
    retryForMs: jobMs,
    ...(o.backoffMs !== undefined ? { backoffMs: o.backoffMs } : {}),
    statusFix: {
      401: 'the API key was refused: check KUBEEZ_API_KEY (keys start with sk_live_)',
      403: 'the API key lacks the generate:media scope: create a key with generate:media at kubeez.com',
      402: 'the Kubeez account is out of credits',
    },
  };
  const pollMs = o.pollMs ?? 2000;
  let listed: Promise<readonly NeuralModelInfo[]> | undefined;
  const models = (): Promise<readonly NeuralModelInfo[]> => {
    listed ??= wireJson(api, `${base}/models?model_type=image`, 'list models').then((v) => {
      const list = (v as { models?: unknown } | null)?.models;
      if (!Array.isArray(list))
        failed(`${base}/models has no models[]`, 'check baseUrl points at the Kubeez API');
      return (list as Record<string, unknown>[])
        .filter((m) => typeof m['model_id'] === 'string')
        .filter(
          (m) =>
            !Array.isArray(m['generation_types']) ||
            (m['generation_types'] as unknown[]).some(
              (g) => g === 'text-to-image' || g === 'image-to-image',
            ),
        )
        .map((m) => ({
          id: m['model_id'] as string,
          task: 'image' as const,
          licence: 'own',
          terms: KUBEEZ_TERMS,
          ...(typeof m['cost_per_generation'] === 'number'
            ? { cost: m['cost_per_generation'] }
            : {}),
        }))
        .sort((a, b) => Number(b.id === o.model) - Number(a.id === o.model));
    });
    listed.catch(() => {
      listed = undefined;
    });
    return listed;
  };
  return {
    id: 'kubeez',
    tasks: ['image'],
    models,
    paid: true,
    // The model's listed cost_per_generation (a free call); NaN when it lists none.
    estimate: async (job) =>
      pickModel('kubeez', await models(), job.task, job.model).cost ?? Number.NaN,
    async run(job) {
      const model = pickModel('kubeez', await models(), job.task, job.model);
      const r = fieldsOf(job.request);
      const sources: string[] = [];
      for (const i of inputsOf(job.task, job.request)) {
        const bytes = job.inputs?.get(i.sha256);
        if (!bytes) continue;
        const up = (await wireJson(
          api,
          `${base}/upload/media`,
          'upload source image',
          multipart(bytes, i.mime),
        )) as { urls?: unknown } | null;
        const url = Array.isArray(up?.urls) ? up.urls[0] : undefined;
        if (typeof url !== 'string')
          failed(
            `${base}/upload/media answered no urls[]`,
            'retry the upload; check the file is a PNG/JPEG',
          );
        sources.push(url as string);
      }
      const width = Number(r['width']);
      const height = Number(r['height']);
      const posted = (await wireJson(api, `${base}/generate/media`, 'generate image', {
        prompt: r['prompt'],
        model: model.id,
        generation_type: sources.length ? 'image-to-image' : 'text-to-image',
        aspect_ratio: aspectOf(width, height),
        seed: r['seed'],
        output_format: 'png',
        ...(typeof r['negative'] === 'string' ? { negative_prompt: r['negative'] } : {}),
        ...(o.resolution ? { resolution: o.resolution } : {}),
        ...(sources.length ? { source_media_urls: sources } : {}),
      })) as { generation_id?: unknown } | null;
      const gid = posted?.generation_id;
      if (typeof gid !== 'string' || !/^[\w-]+$/.test(gid))
        failed(
          `${base}/generate/media answered no generation_id`,
          'check the model id with t3d neural ls',
        );
      const deadline = AbortSignal.timeout(jobMs);
      for (;;) {
        const s = (await wireJson(
          api,
          `${base}/generate/media/${gid}`,
          'poll generation',
        )) as Status;
        if (s?.status === 'failed')
          failed(
            `kubeez generation ${gid} (${model.id}) failed: ${String(s.error_message ?? 'no reason given')}`,
            'change the prompt or model, then run t3d neural run again',
          );
        const urls = (s?.outputs ?? []).map((x) => x?.url);
        if (
          s?.status === 'completed' &&
          urls.length > 0 &&
          urls.every((u) => typeof u === 'string')
        ) {
          const outputs: NeuralOutput[] = [];
          for (const [i, u] of (urls as string[]).entries()) {
            if (!/^https?:\/\//.test(u))
              failed(`kubeez output ${i} url is not http(s)`, 'report it to Kubeez support');
            const got = await wireBytes(shared, u, 'download image', undefined, [
              'image/',
              'application/octet-stream',
            ]);
            outputs.push({
              bytes: fitPng(got.bytes, width, height, `kubeez output ${i}`),
              mime: 'image/png',
            });
          }
          return { result: taskResult(job.task, outputs), model, server: 'kubeez' };
        }
        if (deadline.aborted)
          failed(
            `kubeez generation ${gid} not done within ${jobMs} ms (status ${String(s?.status)})`,
            `raise jobTimeoutMs (now ${jobMs})`,
          );
        await pause(pollMs);
      }
    },
  };
}
