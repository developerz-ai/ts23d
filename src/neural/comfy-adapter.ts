// comfyAdapter: runs the user's own ComfyUI workflow (API-format JSON) for an image-producing task.
// Placeholders in the workflow are filled from the request: a string exactly "{{seed}}" becomes
// the number, "{{prompt}}" inside a string is substituted (prompt, negative, seed, width, height,
// size, steps…: any request field or param). POST /prompt → prompt_id; poll GET /history/<id>;
// the images of the named `outputs` nodes (in that order) are fetched from GET /view and become
// the task's outputs. The model id names the workflow; its sha256 stands in for weightsSha256, so
// editing the workflow changes every job key. Input files (control maps) are not uploaded: use the
// t3d-neural/1 http adapter for conditioned jobs.

import type { NeuralOutput, NeuralTask } from '../core/index.ts';
import {
  canonicalJson,
  fieldsOf,
  inputsOf,
  type NeuralAdapter,
  type NeuralModelInfo,
  pickModel,
  taskResult,
} from './adapter.ts';
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

export interface ComfyAdapterOptions {
  /** ComfyUI root, e.g. 'http://127.0.0.1:8188'. */
  readonly url: string;
  /** The workflow in ComfyUI's API format ("Save (API Format)"). */
  readonly workflow: Readonly<Record<string, unknown>>;
  /** Node ids whose images are the outputs, in order. */
  readonly outputs: readonly string[];
  /** 'image' (default) or 'texture'. */
  readonly task?: 'image' | 'texture';
  /** Model id recorded and keyed (default 'comfy-workflow'). */
  readonly model?: string;
  /** Licence of the checkpoint's outputs: recorded, never gated. */
  readonly licence?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly jobTimeoutMs?: number;
  readonly pollMs?: number;
  readonly maxBytes?: number;
  readonly fetch?: WireFetch;
}

/** Fill `{{field}}` placeholders from `vars`; a whole-string placeholder keeps the value's type. */
export function fillWorkflow(v: unknown, vars: Readonly<Record<string, unknown>>): unknown {
  if (typeof v === 'string') {
    const whole = /^\{\{(\w+)\}\}$/.exec(v);
    if (whole?.[1] !== undefined && whole[1] in vars) return vars[whole[1]];
    return v.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  }
  if (Array.isArray(v)) return v.map((x) => fillWorkflow(x, vars));
  if (v && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillWorkflow(x, vars)]));
  return v;
}

interface ComfyImage {
  readonly filename?: unknown;
  readonly subfolder?: unknown;
  readonly type?: unknown;
}

export function comfyAdapter(o: ComfyAdapterOptions): NeuralAdapter {
  const url = o.url.replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]/.test(url))
    failed(`'${o.url}' is not an http(s) URL`, 'pass the ComfyUI root, e.g. http://127.0.0.1:8188');
  if (o.outputs.length === 0)
    failed('comfyAdapter has no outputs', 'name the SaveImage node ids in outputs');
  const task: NeuralTask = o.task ?? 'image';
  const wire = {
    timeoutMs: o.timeoutMs ?? 60_000,
    maxBytes: o.maxBytes ?? DEFAULT_MAX_BYTES,
    ...(o.headers ? { headers: o.headers } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
  };
  checkWire(wire);
  const jobMs = o.jobTimeoutMs ?? 1_800_000;
  const pollMs = o.pollMs ?? 1000;
  const id = `comfy:${url}`;
  const model: NeuralModelInfo = {
    id: o.model ?? 'comfy-workflow',
    task,
    licence: o.licence ?? 'per the checkpoint licence (not declared: set licence)',
    weightsSha256: sha256Hex(new TextEncoder().encode(canonicalJson(o.workflow))),
  };
  return {
    id,
    tasks: [task],
    models: () => Promise.resolve([model]),
    async run(job) {
      pickModel(id, [model], job.task, job.model);
      if (inputsOf(job.task, job.request).length > 0)
        failed(
          `${id} cannot upload input files`,
          'use the t3d-neural/1 http adapter for conditioned jobs',
        );
      const req = fieldsOf(job.request);
      const vars = { ...(req['params'] as object | undefined), ...req };
      const posted = (await wireJson(wire, `${url}/prompt`, 'queue prompt', {
        prompt: fillWorkflow(o.workflow, vars),
      })) as { prompt_id?: unknown } | null;
      const pid = posted?.prompt_id;
      if (typeof pid !== 'string' || !/^[\w-]+$/.test(pid))
        failed(`${url}/prompt answered no prompt_id`, 'check the workflow is in API format');
      const deadline = AbortSignal.timeout(jobMs);
      for (;;) {
        const h = (await wireJson(wire, `${url}/history/${pid}`, 'poll history')) as Record<
          string,
          { outputs?: Record<string, { images?: ComfyImage[] }>; status?: { status_str?: string } }
        > | null;
        const entry = h?.[pid];
        if (entry?.status?.status_str === 'error')
          failed(`${url} prompt ${pid} failed`, 'open the ComfyUI queue and read the node error');
        if (entry?.outputs) {
          const outputs: NeuralOutput[] = [];
          for (const node of o.outputs)
            for (const img of entry.outputs[node]?.images ?? []) {
              const q = new URLSearchParams({
                filename: String(img.filename ?? ''),
                subfolder: String(img.subfolder ?? ''),
                type: String(img.type ?? 'output'),
              });
              const got = await wireBytes(wire, `${url}/view?${q}`, 'fetch image', undefined, [
                'image/png',
              ]);
              outputs.push({ bytes: got.bytes, mime: 'image/png' });
            }
          return { result: taskResult(job.task, outputs), model, server: 'comfyui' };
        }
        if (deadline.aborted)
          failed(
            `${url} prompt ${pid} not done within ${jobMs} ms`,
            `raise jobTimeoutMs (now ${jobMs})`,
          );
        await pause(pollMs);
      }
    },
  };
}
