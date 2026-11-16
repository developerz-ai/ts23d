// httpAdapter: the `t3d-neural/1` wire protocol, for any GPU server that speaks it.
//   GET  <url>/v1/models   → [{ id, task, licence, weightsSha256?, vramGb? }]
//   POST <url>/v1/jobs     ← { contract, task, model, request, inputs: { <sha256>: base64 } }
//                          → { id }
//   GET  <url>/v1/jobs/:id → { status: queued|running|done|failed, error?, server?,
//                              position?, waiting?, outputs?: [{ mime, data: base64 }], score? }
// A queued job's `waiting` (e.g. "gpu busy: pid 4242 pixal3d") and `position` go to `onWait`
// each time they change, so a user sees why a job is not running (D54).
// Every request has a deadline and a byte cap (wire.ts); the whole job has its own deadline.

import { isNeuralTask, NEURAL_TASKS, type NeuralOutput, type NeuralTask } from '../core/index.ts';
import {
  inputsOf,
  NEURAL_CONTRACT,
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
  pause,
  toBase64,
  type WireFetch,
  wireJson,
} from './wire.ts';

export interface HttpAdapterOptions {
  /** Server root, e.g. 'http://127.0.0.1:8190'. */
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** One request, ms. Default 60 000. */
  readonly timeoutMs?: number;
  /** The whole job (queue + run + download), ms. Default 1 800 000 (30 min). */
  readonly jobTimeoutMs?: number;
  /** Wait between job polls, ms. Default 1000. */
  readonly pollMs?: number;
  /** Largest reply accepted, bytes. Default 64 MB. */
  readonly maxBytes?: number;
  /** Tasks this server is configured for (default all; `models()` is the truth). */
  readonly tasks?: readonly NeuralTask[];
  readonly fetch?: WireFetch;
  /** Told why a queued job waits, once per change. Default: one line on stderr. */
  readonly onWait?: (message: string) => void;
}

/** "job j1 queued (2 ahead): gpu busy: pid 4242 pixal3d", or undefined when not waiting. */
export function waitMessage(
  jid: string,
  s: Readonly<Record<string, unknown>> | null,
): string | undefined {
  if (s?.['status'] !== 'queued') return undefined;
  const pos = s['position'];
  const ahead = typeof pos === 'number' && pos > 0 ? ` (${pos} ahead)` : '';
  const why = typeof s['waiting'] === 'string' ? `: ${s['waiting']}` : '';
  return ahead || why ? `job ${jid} queued${ahead}${why}` : undefined;
}

const SHA = /^[0-9a-f]{64}$/;

function modelOf(v: unknown, url: string): NeuralModelInfo {
  const m = (v ?? {}) as Record<string, unknown>;
  if (typeof m['id'] !== 'string' || !isNeuralTask(m['task']))
    failed(
      `${url}/v1/models lists ${JSON.stringify(v)}`,
      'each model needs a string id and a task from NEURAL_TASKS',
    );
  const w = m['weightsSha256'];
  return {
    id: m['id'] as string,
    task: m['task'] as NeuralTask,
    licence: typeof m['licence'] === 'string' ? m['licence'] : 'undeclared by the server',
    ...(typeof w === 'string' && SHA.test(w) ? { weightsSha256: w } : {}),
    ...(typeof m['vramGb'] === 'number' ? { vramGb: m['vramGb'] } : {}),
  };
}

function outputsOf(v: unknown, url: string): NeuralOutput[] {
  if (!Array.isArray(v))
    return failed(`${url}: job done without outputs`, 'return outputs: [{ mime, data }]');
  return v.map((o: { mime?: unknown; data?: unknown }, i) => ({
    mime: String(o?.mime ?? ''),
    bytes: fromBase64(String(o?.data ?? ''), `${url} output ${i}`),
  }));
}

export function httpAdapter(o: HttpAdapterOptions): NeuralAdapter {
  const url = o.url.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]/.test(url))
    failed(
      `'${o.url}' is not an http(s) URL`,
      "pass the server root, e.g. http('http://127.0.0.1:8190')",
    );
  const wire = {
    timeoutMs: o.timeoutMs ?? 60_000,
    maxBytes: o.maxBytes ?? DEFAULT_MAX_BYTES,
    ...(o.headers ? { headers: o.headers } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
  };
  const jobMs = o.jobTimeoutMs ?? 1_800_000;
  const pollMs = o.pollMs ?? 1000;
  const onWait = o.onWait ?? ((m: string) => console.error(m));
  checkWire(wire);
  checkWire({ timeoutMs: jobMs, maxBytes: pollMs + 1 });
  let listed: Promise<readonly NeuralModelInfo[]> | undefined;
  const id = `http:${url}`;
  const models = (): Promise<readonly NeuralModelInfo[]> => {
    listed ??= wireJson(wire, `${url}/v1/models`, 'list models').then((v) => {
      if (!Array.isArray(v))
        failed(`${url}/v1/models is not an array`, 'answer [{ id, task, licence }]');
      return (v as unknown[]).map((m) => modelOf(m, url));
    });
    listed.catch(() => {
      listed = undefined;
    });
    return listed;
  };
  return {
    id,
    tasks: o.tasks ?? NEURAL_TASKS,
    models,
    async run(job) {
      const model = pickModel(id, await models(), job.task, job.model);
      const inputs: Record<string, string> = {};
      for (const i of inputsOf(job.task, job.request)) {
        const b = job.inputs?.get(i.sha256);
        if (b) inputs[i.sha256] = toBase64(b);
      }
      const posted = (await wireJson(wire, `${url}/v1/jobs`, 'submit job', {
        contract: NEURAL_CONTRACT,
        task: job.task,
        model: model.id,
        request: job.request,
        inputs,
      })) as { id?: unknown } | null;
      const jid = posted?.id;
      if (typeof jid !== 'string' || !/^[\w.-]+$/.test(jid))
        failed(`${url}/v1/jobs answered no job id`, 'answer { id: "<job id>" } to POST /v1/jobs');
      const deadline = AbortSignal.timeout(jobMs);
      let told: string | undefined;
      for (;;) {
        const s = (await wireJson(wire, `${url}/v1/jobs/${jid}`, 'poll job')) as Record<
          string,
          unknown
        > | null;
        const status = s?.['status'];
        const waiting = waitMessage(jid, s);
        if (waiting !== undefined && waiting !== told) onWait(`${model.id} @ ${url}: ${waiting}`);
        told = waiting;
        if (status === 'failed')
          failed(
            `${url} job ${jid} (${model.id}) failed: ${String(s?.['error'] ?? 'no reason given')}`,
            `read the model server log for job ${jid}; check the request fits ${model.id} (vram ${model.vramGb ?? '?'} GB)`,
          );
        if (status === 'done') {
          const outputs = outputsOf(s?.['outputs'], url);
          const result = taskResult(job.task, outputs, Number(s?.['score']));
          const server = typeof s?.['server'] === 'string' ? { server: s['server'] } : {};
          return { result, model, ...server };
        }
        if (deadline.aborted)
          failed(
            `${url} job ${jid} not done within ${jobMs} ms (status ${String(status)})`,
            `raise jobTimeoutMs (now ${jobMs}) or check the server queue`,
          );
        await pause(pollMs);
      }
    },
  };
}

/** Config shorthand: `neural: { mesh: http('http://gpu:8190', 'pixal3d') }`. */
export const http = (
  url: string,
  model?: string,
  o: Omit<HttpAdapterOptions, 'url'> = {},
): NeuralBinding => ({ adapter: httpAdapter({ ...o, url }), ...(model ? { model } : {}) });
