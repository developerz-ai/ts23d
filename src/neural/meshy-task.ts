// One Meshy task from create to SUCCEEDED, under the rules of docs/research/meshy.md §1. Meshy has
// no idempotency key, so a create is never repeated blindly: before the POST the endpoint's newest
// task id is stored as a marker ('?<id>'); the task id replaces it the moment the POST answers. A
// POST that ends without a clear refusal (timeout, dropped connection, 5xx) leaves the marker, and
// the next run LISTS the endpoint's tasks instead of posting: exactly one newer task is adopted,
// none means nothing was created (post again), several are named for the user to choose. A stored
// id is polled, never re-created (resume). Poll at Retry-After or `pollMs` to SUCCEEDED; FAILED /
// CANCELED are refunded by Meshy and never retried here. Result files are downloaded WITHOUT the
// API key (another host) and at once: signed URLs expire and files are deleted after 3 days. The
// store also remembers which task made a downloaded GLB ('glb:<sha256>'), so a later rig can name
// it (`input_task_id`) instead of uploading it again.

import { canonicalJson } from './adapter.ts';
import { filePending, meshyNet } from './meshy-net.ts';
import type { MeshyOptions, MeshyPending } from './meshy-params.ts';
import { sha256Hex } from './sha256.ts';
import {
  checkWire,
  DEFAULT_MAX_BYTES,
  failed,
  pause,
  type WireOptions,
  type WireSignal,
  wireBytes,
  wireJson,
} from './wire.ts';

export type MeshyTask = Readonly<Record<string, unknown>>;

export interface MeshyDone {
  /** The pending-store key, dropped once the result is downloaded. */
  readonly key: string;
  readonly id: string;
  readonly resumed: boolean;
  /** The SUCCEEDED task object. */
  readonly task: MeshyTask;
  readonly credits: number;
}

export interface MeshyTasks {
  readonly base: string;
  readonly jobMs: number;
  readonly store: () => MeshyPending;
  /** Create (or resume) one task and poll it to SUCCEEDED, within `deadline`. */
  run(path: string, body: object, what: string, deadline: WireSignal): Promise<MeshyDone>;
  /** Authenticated GET of an API path (library, balance): costs no credits. */
  get(path: string, what: string): Promise<unknown>;
  /** Download one result file of `steps` (keyless). */
  download(
    url: unknown,
    what: string,
    steps: readonly MeshyDone[],
    png?: boolean,
  ): Promise<Uint8Array>;
  /** Every result is downloaded: drop the steps' pending entries. */
  forget(steps: readonly MeshyDone[]): void;
}

const STATUS_FIX: Readonly<Record<number, string>> = {
  400: 'Meshy refused the request: check the input (image PNG/JPEG/WebP ≥ 32 px ≤ 20 MB; GLB ≤ 380 000 triangles), prompt (≤ 800 chars) and options',
  401: 'the API key was refused: check MESHY_API_KEY (keys start with msy_)',
  402: 'the Meshy account is out of credits (API keys need a paid plan)',
  403: 'Meshy blocked the input (moderation) or the endpoint is not on your plan',
  422: 'Meshy could not find a humanoid pose (not charged): rig a textured biped that faces +Z (glTF front), in A- or T-pose, on the default skeleton',
};
/** Endpoints documented as "newest first" with no sort parameter; the rest take sort_by. */
const UNSORTED = ['v1/rigging', 'v1/animations'];
const idOf = (v: unknown): string | undefined =>
  typeof v === 'string' && /^[\w-]+$/.test(v) ? v : undefined;
const refused = (e: unknown): boolean => e instanceof Error && /HTTP [34]\d\d/.test(e.message);

export function meshyTasks(o: MeshyOptions): MeshyTasks {
  if (!o.apiKey)
    failed(
      'meshyAdapter has no API key',
      'set MESHY_API_KEY (meshy.ai → API settings) and pass apiKey: process.env.MESHY_API_KEY',
    );
  const base = `${(o.baseUrl ?? 'https://api.meshy.ai').replace(/\/+$/, '').replace(/\/openapi$/, '')}/openapi`;
  if (!/^https?:\/\/[^/]/.test(base))
    failed(`'${o.baseUrl}' is not an http(s) URL`, 'pass baseUrl like https://api.meshy.ai');
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
  const wire = (expired: () => boolean) => {
    const net = meshyNet(o.fetch, expired, o.backoffMs ?? 5000);
    const api: WireOptions = {
      ...shared,
      fetch: net.fetch,
      headers: { authorization: `Bearer ${o.apiKey ?? ''}` },
      statusFix: STATUS_FIX,
    };
    return { net, api };
  };

  async function run(
    path: string,
    body: object,
    what: string,
    deadline: WireSignal,
  ): Promise<MeshyDone> {
    const { net, api } = wire(() => deadline.aborted);
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
    /** The endpoint's newest tasks, newest first. */
    const newestTasks = async (): Promise<MeshyTask[]> => {
      const q = UNSORTED.includes(path) ? 'page_size=10' : 'page_size=10&sort_by=-created_at';
      const got = await wireJson(api, `${base}/${path}?${q}`, `list ${what}`).catch(busy);
      return (Array.isArray(got) ? got : []).filter(
        (t): t is MeshyTask => idOf((t as MeshyTask | null)?.['id']) !== undefined,
      );
    };
    const newest = async (): Promise<string[]> =>
      (await newestTasks()).map((t) => idOf(t['id']) as string);
    const key = sha256Hex(new TextEncoder().encode(canonicalJson({ base, path, body })));
    let id = store().get(key);
    if (id?.startsWith('?')) {
      // A create whose outcome is unknown: look, never post again blindly.
      const tasks = await newestTasks();
      const list = tasks.map((t) => idOf(t['id']) as string);
      const mark = list.indexOf(id.slice(1));
      const since = mark < 0 ? list : list.slice(0, mark);
      // The one newer task may be another request's (ours never arrived): whatever of the request
      // the task echoes must agree before it is adopted.
      const differs = since.length === 1 ? echoMismatch(tasks[0], body) : undefined;
      if (differs)
        failed(
          `meshy ${what}: an earlier create ended without a reply; the one task made since (${since[0]}) is another request's (${differs})`,
          `if this request's task exists on meshy.ai write its id as the value of "${key}" in the pending store ($TS23D_HOME/meshy/pending.json); else delete that entry (a new task is then created and charged)`,
        );
      if (since.length > 1)
        failed(
          `meshy ${what}: an earlier create ended without a reply and ${since.length} tasks were made since (${since.join(', ')})`,
          `find the one for this request on meshy.ai and write its id as the value of "${key}" in the pending store ($TS23D_HOME/meshy/pending.json); delete that entry only if none is (a new task is then created and charged)`,
        );
      id = since[0];
      if (id) store().set(key, id);
      else store().delete(key);
    }
    const resumed = id !== undefined;
    if (!id) {
      store().set(key, `?${(await newest())[0] ?? ''}`);
      const posted = (await wireJson(api, `${base}/${path}`, `create ${what}`, body).catch(
        (e: unknown) => {
          if (refused(e)) {
            store().delete(key);
            return busy(e);
          }
          return failed(
            `meshy create ${what} ended without a reply (${e instanceof Error ? e.message : String(e)}): the task may exist and be charged`,
            'wait a minute, then run again: the newest tasks are listed and this one is adopted if it was created (never posted twice)',
          );
        },
      )) as { result?: unknown } | null;
      id = idOf(posted?.result);
      if (!id)
        failed(
          `${base}/${path} answered no task id (result)`,
          'check baseUrl points at the Meshy API',
        );
      store().set(key, id as string);
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
      )) as MeshyTask | null;
      const status = s?.['status'];
      if (status === 'FAILED' || status === 'CANCELED') {
        store().delete(key);
        const reason = (s?.['task_error'] as { message?: unknown } | null)?.message;
        failed(
          `meshy ${what} ${id} ${status.toLowerCase()} (credits refunded): ${String(reason ?? 'no reason given')}`,
          'change the input or its options (or the model), then run t3d neural run again; the same request is not retried',
        );
      }
      if (s && status === 'SUCCEEDED') {
        const credits = Number(s['consumed_credits']);
        return {
          key,
          id: id as string,
          resumed,
          task: s,
          credits: Number.isFinite(credits) ? credits : Number.NaN,
        };
      }
      if (deadline.aborted)
        failed(
          `meshy ${what} ${id} not done within ${jobMs} ms (status ${String(status)})`,
          `run again to resume polling task ${id} (no new charge), or raise jobTimeoutMs (now ${jobMs})`,
        );
      await pause(net.retryAfterMs() ?? pollMs);
    }
  }

  async function download(
    url: unknown,
    what: string,
    steps: readonly MeshyDone[],
    png = false,
  ): Promise<Uint8Array> {
    const last = steps[steps.length - 1];
    if (typeof url !== 'string' || !/^https?:\/\//.test(url))
      failed(
        `meshy task ${last?.id ?? '?'} succeeded without an http(s) ${what} URL`,
        'report it to Meshy support',
      );
    const types = [png ? 'image/png' : 'model/gltf-binary', 'application/octet-stream', 'binary/'];
    const got = await wireBytes(shared, url as string, `download ${what}`, undefined, types).catch(
      (e: unknown) => {
        if (!refused(e)) throw e;
        // A refused download = an expired signed URL or deleted files (kept 3 days). Only the
        // task whose file was refused can tell: a resumed one may be past retention; a task
        // created in this run cannot be, whatever was resumed before it, so its ids are kept and
        // the rerun reads a fresh URL.
        const stale = last?.resumed === true;
        if (stale) for (const s of steps) store().delete(s.key);
        return failed(
          `meshy ${what} of task ${last?.id ?? '?'} cannot be downloaded: ${(e as Error).message.replace(/\?\S*/, '?…')}`,
          stale
            ? 'the files are gone (Meshy keeps them 3 days): run again to create a new task (charged)'
            : 'the signed URL expired: run again, the task is resumed and its fresh URL used (no new charge)',
        );
      },
    );
    return got.bytes;
  }

  return {
    base,
    jobMs,
    store,
    run,
    get: (path, what) => {
      const limit = AbortSignal.timeout(shared.timeoutMs);
      return wireJson(wire(() => limit.aborted).api, `${base}/${path}`, what);
    },
    download,
    forget: (steps) => {
      for (const s of steps) store().delete(s.key);
    },
  };
}

/**
 * Why `task` cannot be the task of `body`: the first request field the task echoes with another
 * value (Meshy echoes some: prompt, ai_model, pose_mode, height_meters…), or undefined when
 * nothing it echoes disagrees. A task that echoes nothing is adopted as before.
 */
export function echoMismatch(task: MeshyTask | undefined, body: object): string | undefined {
  if (!task) return undefined;
  for (const [k, want] of Object.entries(body)) {
    const got = task[k];
    if (got === undefined || got === null || typeof got === 'object') continue;
    if (typeof want === 'object' || want === undefined) continue;
    // Uploads are echoed as stored URLs, never as the data URI that was sent.
    if (typeof want === 'string' && want.startsWith('data:')) continue;
    if (String(got) !== String(want)) return `${k} is ${String(got).slice(0, 40)}`;
  }
  return undefined;
}
