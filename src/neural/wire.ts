// The HTTP plumbing every network adapter shares: one JSON request over fetch (injected or global)
// with a deadline, a byte cap checked before and after the body is read, and the reply's content
// type checked. HTTP 429 is retried with exponential backoff (honouring Retry-After) while a
// `retryForMs` budget lasts. Network failures and HTTP errors are T3D_NEURAL_FAILED with a fix
// naming the endpoint (or the caller's `statusFix`); a reply of the wrong type or size is
// T3D_NEURAL_OUTPUT_INVALID. Errors never carry headers (API keys). No Bun or Node API: it runs
// wherever fetch, AbortSignal and atob/btoa exist.

import { Ts23dError } from '../core/index.ts';

/** A structural subset of fetch's init and Response (no DOM lib needed). */
export interface WireInit {
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly signal?: WireSignal;
}
/** An AbortSignal, typed structurally: consumers may compile without the DOM lib. */
export interface WireSignal {
  readonly aborted: boolean;
}
export interface WireReply {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export type WireFetch = (url: string, init: WireInit) => Promise<WireReply>;

export interface WireOptions {
  /** Headers sent with every request (API keys): the caller's, never read from the environment. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Deadline for one request including its body, ms. */
  readonly timeoutMs: number;
  /** Largest reply body accepted, bytes. */
  readonly maxBytes: number;
  readonly fetch?: WireFetch;
  /** Keep retrying HTTP 429 for this long, ms (default: no retry). */
  readonly retryForMs?: number;
  /** First 429 backoff, ms, doubled per retry up to 30 s. Default 1000. */
  readonly backoffMs?: number;
  /** A fix per HTTP status, e.g. { 403: 'grant the key the generate:media scope' }. */
  readonly statusFix?: Readonly<Record<number, string>>;
}

/** A non-JSON request body (multipart uploads). */
export interface RawBody {
  readonly raw: Uint8Array;
  readonly type: string;
}

const isRaw = (b: unknown): b is RawBody =>
  typeof b === 'object' && b !== null && (b as Partial<RawBody>).raw instanceof Uint8Array;

export const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;

export function failed(cause: string, fix: string): never {
  throw new Ts23dError('T3D_NEURAL_FAILED', { cause, fix });
}

function invalid(cause: string, fix: string): never {
  throw new Ts23dError('T3D_NEURAL_OUTPUT_INVALID', { cause, fix });
}

export function checkWire(o: { readonly timeoutMs: number; readonly maxBytes: number }): void {
  for (const [k, v] of [
    ['timeoutMs', o.timeoutMs],
    ['maxBytes', o.maxBytes],
  ] as const)
    if (!(Number.isFinite(v) && v > 0))
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${k} is ${v}`,
        fix: `pass ${k} as a positive number`,
      });
}

/** One request → body bytes and content type; `types` are the accepted content-type prefixes. */
export async function wireBytes(
  o: WireOptions,
  url: string,
  what: string,
  body?: unknown,
  types: readonly string[] = ['application/json'],
): Promise<{ readonly bytes: Uint8Array; readonly type: string }> {
  const budget = AbortSignal.timeout(o.retryForMs ?? 1);
  let backoff = o.backoffMs ?? 1000;
  for (;;) {
    const r = await attempt(o, url, what, body, types);
    if (r !== 429) return r;
    if (o.retryForMs === undefined || budget.aborted)
      failed(
        `${what} ${url}: HTTP 429 rate limited`,
        `wait and run again, or raise retryForMs (now ${o.retryForMs ?? 0})`,
      );
    await pause(backoff);
    backoff = Math.min(backoff * 2, 30_000);
  }
}

async function attempt(
  o: WireOptions,
  url: string,
  what: string,
  body: unknown,
  types: readonly string[],
): Promise<{ readonly bytes: Uint8Array; readonly type: string } | 429> {
  const signal = AbortSignal.timeout(o.timeoutMs);
  const type0 = isRaw(body) ? body.type : 'application/json';
  const init: WireInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      accept: types.join(', '),
      ...(body === undefined ? {} : { 'content-type': type0 }),
      ...(o.headers ?? {}),
    },
    ...(body === undefined ? {} : { body: isRaw(body) ? body.raw : JSON.stringify(body) }),
    signal,
  };
  const go =
    o.fetch ??
    ((u: string, i: WireInit) =>
      fetch(u, {
        method: i.method,
        headers: i.headers,
        signal,
        ...(i.body === undefined
          ? {}
          : { body: typeof i.body === 'string' ? i.body : new Blob([new Uint8Array(i.body)]) }),
      }) as Promise<WireReply>);
  const late = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
  );
  const down = (e: unknown): never =>
    failed(
      signal.aborted
        ? `${what} ${url}: no reply within ${o.timeoutMs} ms`
        : `${what} ${url}: ${e instanceof Error ? e.message : String(e)}`,
      `start the model server at ${url} and check its log, or raise timeoutMs (now ${o.timeoutMs})`,
    );
  const res = await Promise.race([go(url, init), late]).catch(down);
  if (res.status === 429) return 429;
  if (!res.ok)
    failed(
      `${what} ${url}: HTTP ${res.status}`,
      o.statusFix?.[res.status] ??
        `check the model server log at ${url}; HTTP ${res.status} means it refused or crashed on the job`,
    );
  const tooBig = (n: number): never =>
    invalid(
      `${what} ${url}: reply is ${n} bytes, cap ${o.maxBytes}`,
      "ask for smaller outputs, or raise the adapter's maxBytes in t3d.config.ts: http(url, model, { maxBytes: 256 * 1024 * 1024 })",
    );
  const declared = Number(res.headers.get('content-length') ?? Number.NaN);
  if (declared > o.maxBytes) tooBig(declared);
  const type = (res.headers.get('content-type') ?? '').toLowerCase();
  if (!types.some((t) => type.startsWith(t)))
    invalid(
      `${what} ${url}: reply is '${type || 'untyped'}', not ${types.join(' or ')}`,
      `the server must answer ${types.join(' or ')}`,
    );
  const bytes = new Uint8Array(await Promise.race([res.arrayBuffer(), late]).catch(down));
  if (bytes.length > o.maxBytes) tooBig(bytes.length);
  return { bytes, type };
}

/** One request → parsed JSON. `what` names the call in errors. */
export async function wireJson(
  o: WireOptions,
  url: string,
  what: string,
  body?: unknown,
): Promise<unknown> {
  const { bytes } = await wireBytes(o, url, what, body);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return invalid(`${what} ${url}: reply is not JSON`, 'the server must answer valid JSON');
  }
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string, what: string): Uint8Array {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return invalid(`${what} is not base64`, 'encode output bytes as standard base64');
  }
}

/** Resolve after `ms` (job polling). */
export const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
