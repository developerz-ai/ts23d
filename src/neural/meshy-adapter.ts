// meshyAdapter: the `mesh` task on meshy.ai, a hosted image-to-3D / text-to-3D service, for users
// without a GPU. One adapter among many; any other works the same way. A request with `image`
// goes to POST /openapi/v1/image-to-3d (the image inline as a data URI); a prompt-only one to
// POST /openapi/v2/text-to-3d (mode 'preview', then 'refine' when `texture` is on). Each answers
// { result: <task id> }; the id is stored (meshy-net.ts) BEFORE polling, so a rerun after a
// timeout resumes the same, already-charged task: Meshy has no idempotency key. Poll GET
// <endpoint>/<id> at Retry-After or `pollMs` until SUCCEEDED (model_urls.glb) or FAILED / CANCELED
// (refunded; task_error.message); download the GLB WITHOUT the API key (another host). runJob then
// validates it like every mesh output. Both kinds of 429 wait within the job deadline (default
// 60 min, Meshy's guidance). Request bodies, model caps and costs: meshy-params.ts. The key is the
// caller's (`apiKey`: process.env.MESHY_API_KEY in t3d.config.ts); it goes only into the
// Authorization header, never into records, the pending file, logs or errors. Outputs: every API
// key belongs to a paid plan, whose outputs the user owns (Meshy terms) → licence 'own' + terms URL.
// Meshy's consumed_credits and the task id go into the record's `server` line.

import type { NeuralOutput } from '../core/index.ts';
import {
  canonicalJson,
  fieldsOf,
  type NeuralAdapter,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
import { filePending, meshyNet } from './meshy-net.ts';
import {
  checkOptions,
  imageBody,
  MESHY_MODELS,
  type MeshyOptions,
  type MeshyPending,
  meshyCost,
  previewBody,
  refineBody,
} from './meshy-params.ts';
import { sha256Hex } from './sha256.ts';
import {
  checkWire,
  DEFAULT_MAX_BYTES,
  failed,
  pause,
  toBase64,
  type WireOptions,
  wireBytes,
  wireJson,
} from './wire.ts';

export const MESHY_TERMS = 'https://www.meshy.ai/terms-of-use';

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

type Task = {
  status?: unknown;
  consumed_credits?: unknown;
  model_urls?: { glb?: unknown } | null;
  task_error?: { message?: unknown } | null;
} | null;

interface Done {
  /** The pending-store key, dropped once the GLB is downloaded. */
  readonly key: string;
  readonly id: string;
  readonly glb: string;
  readonly credits: number;
}

export function meshyAdapter(o: MeshyOptions): NeuralAdapter {
  if (!o.apiKey)
    failed(
      'meshyAdapter has no API key',
      'set MESHY_API_KEY (meshy.ai → API settings) and pass apiKey: process.env.MESHY_API_KEY',
    );
  const base = `${(o.baseUrl ?? 'https://api.meshy.ai').replace(/\/+$/, '').replace(/\/openapi$/, '')}/openapi`;
  if (!/^https?:\/\/[^/]/.test(base))
    failed(`'${o.baseUrl}' is not an http(s) URL`, 'pass baseUrl like https://api.meshy.ai');
  const pick = o.model ?? 'latest';
  checkOptions(o, pick);
  const jobMs = o.jobTimeoutMs ?? 3_600_000;
  const pollMs = o.pollMs ?? 5000;
  const shared = {
    timeoutMs: o.timeoutMs ?? 60_000,
    maxBytes: o.maxBytes ?? DEFAULT_MAX_BYTES,
    ...(o.fetch ? { fetch: o.fetch } : {}),
  };
  checkWire(shared);
  let pending: MeshyPending | undefined = o.pending;
  const store = (): MeshyPending => {
    pending ??= filePending(process.env);
    return pending;
  };
  const models = (): Promise<readonly NeuralModelInfo[]> =>
    Promise.resolve(
      Object.keys(MESHY_MODELS)
        .map((id) => ({
          id,
          task: 'mesh' as const,
          licence: 'own',
          terms: MESHY_TERMS,
          cost: meshyCost(o, id),
        }))
        .sort((a, b) => Number(b.id === pick) - Number(a.id === pick)),
    );

  /** Create (or resume) one task and poll it to SUCCEEDED, within `deadline`. */
  async function task(
    path: string,
    body: object,
    what: string,
    deadline: AbortSignal,
  ): Promise<Done> {
    const net = meshyNet(o.fetch, () => deadline.aborted, o.backoffMs ?? 5000);
    const api: WireOptions = {
      ...shared,
      fetch: net.fetch,
      headers: { authorization: `Bearer ${o.apiKey ?? ''}` },
      statusFix: {
        400: 'Meshy refused the request: check the image (PNG/JPEG/WebP ≥ 32 px, ≤ 20 MB), prompt (≤ 800 chars) and options',
        401: 'the API key was refused: check MESHY_API_KEY (keys start with msy_)',
        402: 'the Meshy account is out of credits (API keys need a paid plan)',
        403: 'Meshy blocked the input (moderation) or the endpoint is not on your plan',
      },
    };
    const busy = (e: unknown): never => {
      const kind = net.last429();
      if (kind && e instanceof Error && e.message.includes('HTTP 429'))
        failed(
          `meshy ${what}: ${kind === 'slots' ? 'too many pending tasks (NoMorePendingTasks / NoMoreConcurrentTasks)' : 'rate limited'} until the job deadline`,
          kind === 'slots'
            ? `wait for your running Meshy tasks to finish (concurrent tasks: Pro 10, Premium 30, Studio 60, Ultra 100), or raise jobTimeoutMs (now ${jobMs})`
            : `wait and run again, or raise jobTimeoutMs (now ${jobMs})`,
        );
      throw e;
    };
    const key = sha256Hex(new TextEncoder().encode(canonicalJson({ base, path, body })));
    let id = store().get(key);
    const resumed = id !== undefined;
    if (!id) {
      const posted = (await wireJson(api, `${base}/${path}`, `create ${what}`, body).catch(
        busy,
      )) as { result?: unknown } | null;
      const made = posted?.result;
      if (typeof made !== 'string' || !/^[\w-]+$/.test(made))
        failed(
          `${base}/${path} answered no task id (result)`,
          'check baseUrl points at the Meshy API',
        );
      id = made as string;
      store().set(key, id);
    }
    for (;;) {
      const s = (await wireJson(api, `${base}/${path}/${id}`, `poll ${what}`).catch(
        (e: unknown) => {
          if (resumed && e instanceof Error && e.message.includes('HTTP 404')) {
            store().delete(key);
            failed(
              `meshy ${what} ${id} (resumed) is gone: HTTP 404`,
              'run again: a new task is created (and charged)',
            );
          }
          return busy(e);
        },
      )) as Task;
      if (s?.status === 'FAILED' || s?.status === 'CANCELED') {
        store().delete(key);
        failed(
          `meshy ${what} ${id} ${String(s.status).toLowerCase()} (credits refunded): ${String(s.task_error?.message ?? 'no reason given')}`,
          'change the image or prompt (or the model), then run t3d neural run again',
        );
      }
      const glb = s?.model_urls?.glb;
      if (s?.status === 'SUCCEEDED') {
        if (typeof glb !== 'string' || !/^https?:\/\//.test(glb))
          failed(
            `meshy ${what} ${id} succeeded without an http(s) model_urls.glb`,
            'report it to Meshy support',
          );
        const credits = Number(s.consumed_credits);
        return {
          key,
          id,
          glb: glb as string,
          credits: Number.isFinite(credits) ? credits : Number.NaN,
        };
      }
      if (deadline.aborted)
        failed(
          `meshy ${what} ${id} not done within ${jobMs} ms (status ${String(s?.status)})`,
          `run again to resume polling task ${id} (no new charge), or raise jobTimeoutMs (now ${jobMs})`,
        );
      await pause(net.retryAfterMs() ?? pollMs);
    }
  }

  return {
    id: 'meshy',
    tasks: ['mesh'],
    models,
    async run(job) {
      const model = pickModel('meshy', await models(), job.task, job.model);
      checkOptions(o, model.id);
      const deadline = AbortSignal.timeout(jobMs);
      const r = fieldsOf(job.request);
      const cap = typeof r['maxTriangles'] === 'number' ? r['maxTriangles'] : undefined;
      const prompt =
        typeof r['prompt'] === 'string' && r['prompt'].trim() ? r['prompt'] : undefined;
      const image = r['image'] as { sha256: string; mime: string } | undefined;
      const steps: Done[] = [];
      if (image) {
        const bytes = job.inputs?.get(image.sha256);
        if (!bytes || !IMAGE_MIMES.includes(image.mime))
          failed(
            `meshy image-to-3d input is ${bytes ? `'${image.mime}'` : 'missing'}`,
            `pass a ${IMAGE_MIMES.join(' / ')} image and its bytes in job.inputs`,
          );
        const uri = `data:${image.mime};base64,${toBase64(bytes as Uint8Array)}`;
        const body = imageBody(o, model.id, uri, cap, prompt);
        steps.push(await task('v1/image-to-3d', body, 'image-to-3d', deadline));
      } else {
        if (!prompt)
          failed(
            'meshy mesh request has neither image nor prompt',
            'give the mesh request an image or a prompt',
          );
        const text = prompt as string;
        const body = previewBody(o, model.id, text, cap);
        steps.push(await task('v2/text-to-3d', body, 'text-to-3d preview', deadline));
        const previewId = steps[0]?.id ?? '';
        if (o.texture)
          steps.push(
            await task(
              'v2/text-to-3d',
              refineBody(o, previewId, text),
              'text-to-3d refine',
              deadline,
            ),
          );
      }
      const last = steps[steps.length - 1] as Done;
      const got = await wireBytes(shared, last.glb, 'download GLB', undefined, [
        'model/gltf-binary',
        'application/octet-stream',
        'binary/octet-stream',
      ]);
      for (const s of steps) store().delete(s.key);
      const outputs: NeuralOutput[] = [{ bytes: got.bytes, mime: 'model/gltf-binary' }];
      const credits = steps.reduce((n, s) => n + s.credits, 0);
      const server = `meshy task ${steps.map((s) => s.id).join(' + ')}; consumed_credits ${credits}`;
      return { result: taskResult(job.task, outputs), model, server };
    },
  };
}
