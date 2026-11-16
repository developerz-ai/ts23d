// Meshy's network rules around wire.ts: a fetch wrapper that waits out both kinds of HTTP 429
// within the job deadline — "Rate limit exceeded" for Retry-After (else a doubling backoff), and
// NoMorePendingTasks / NoMoreConcurrentTasks (no header: the plan's task slots are full) with the
// backoff — and remembers each reply's Retry-After so polls can honour it. Plus the default
// pending-task store: one JSON file, $TS23D_HOME/meshy/pending.json (default ~/.ts23d), mapping a
// request hash to the task id it created, so a rerun after a timeout resumes instead of paying
// (memoryPending keeps it in memory instead).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MeshyPending } from './meshy-params.ts';
import { failed, pause, type WireFetch, type WireInit, type WireReply } from './wire.ts';

export interface MeshyNet {
  readonly fetch: WireFetch;
  /** Retry-After of the last reply, ms, when it named one. */
  retryAfterMs(): number | undefined;
  /** The kind of the last 429 seen, if any. */
  last429(): 'rate' | 'slots' | undefined;
}

const SLOTS = /NoMore(Pending|Concurrent)Tasks/;

const globalFetch: WireFetch = (u: string, i: WireInit) =>
  fetch(u, {
    method: i.method,
    headers: i.headers,
    ...(typeof i.body === 'string' ? { body: i.body } : {}),
    ...(i.signal ? { signal: i.signal as AbortSignal } : {}),
  }) as Promise<WireReply>;

/** Wrap `inner` for one job that ends once `expired()` is true. */
export function meshyNet(
  inner: WireFetch | undefined,
  expired: () => boolean,
  backoffMs: number,
): MeshyNet {
  const go = inner ?? globalFetch;
  let after: number | undefined;
  let kind: 'rate' | 'slots' | undefined;
  const wrapped: WireFetch = async (url, init) => {
    let wait = backoffMs;
    for (;;) {
      const r = await go(url, init);
      const ra = Number(r.headers.get('retry-after') ?? Number.NaN);
      after = Number.isFinite(ra) && ra >= 0 ? ra * 1000 : undefined;
      if (r.status !== 429) return r;
      const text = new TextDecoder().decode(await r.arrayBuffer());
      kind = SLOTS.test(text) ? 'slots' : 'rate';
      const ms = kind === 'rate' && after !== undefined ? after : wait;
      if (expired())
        return {
          ok: false,
          status: 429,
          headers: r.headers,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        };
      await pause(ms);
      wait = Math.min(wait * 2, 60_000);
    }
  };
  return { fetch: wrapped, retryAfterMs: () => after, last429: () => kind };
}

/** A pending store that lives as long as the process (tests, or no persistence wanted). */
export function memoryPending(): MeshyPending & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (k) => map.get(k),
    set: (k, id) => {
      map.set(k, id);
    },
    delete: (k) => {
      map.delete(k);
    },
  };
}

/** The default pending store: $TS23D_HOME/meshy/pending.json, rewritten atomically. */
export function filePending(env: Readonly<Record<string, string | undefined>>): MeshyPending {
  const home = env['TS23D_HOME'] ?? join(env['HOME'] ?? '.', '.ts23d');
  const file = join(home, 'meshy', 'pending.json');
  const read = (): Record<string, string> => {
    if (!existsSync(file)) return {};
    try {
      const v = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>;
    } catch {
      // falls through to the refusal below
    }
    return failed(
      `${file} is not a JSON object of request hash → Meshy task id`,
      'delete it (unfinished Meshy tasks are then created again and charged again)',
    );
  };
  const write = (m: Record<string, string>): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(`${file}.tmp`, `${JSON.stringify(m, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  };
  return {
    get: (k) => read()[k],
    set: (k, id) => write({ ...read(), [k]: id }),
    delete: (k) => {
      const { [k]: _gone, ...rest } = read();
      write(rest);
    },
  };
}
