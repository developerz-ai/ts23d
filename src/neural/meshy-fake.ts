// Test double of the Meshy API for the meshy-*.test.ts files (not exported): a scripted fetch
// that answers only two made-up hosts. Any other URL (api.meshy.ai above all) is recorded as
// stray and rejected, so a test can never reach the real service or spend a credit.

import type { WireFetch, WireInit } from './wire.ts';

export const FAKE_API = 'https://api.meshy.test';
export const FAKE_CDN = 'https://assets.meshy.test';

export interface FakeSeen {
  readonly method: string;
  readonly url: string;
  readonly auth: string | undefined;
  readonly body: string;
}
export interface FakeReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly retryAfter?: string;
}
export interface FakeScript {
  /** Replies to POSTs, in order; default: { result: '<letter>-<n>' } per endpoint. */
  create: FakeReply[];
  /** Replies to task GETs, in order; default IN_PROGRESS. */
  polls: FakeReply[];
  /** Replies to list GETs (arrays of tasks), in order; default []. */
  lists: unknown[][];
  /** POSTs that reach the server (a task is "made") but whose reply is lost. */
  drop: number;
  library: unknown;
  balance: unknown;
  /** What the CDN serves, and with which type / status. */
  file: Uint8Array;
  fileType: string;
  fileStatus: number;
  /** Task ids whose GET answers 404. */
  gone: string[];
}
export interface FakeMeshy {
  readonly fetch: WireFetch;
  readonly seen: FakeSeen[];
  readonly stray: string[];
  script: FakeScript;
  reset(file: Uint8Array): void;
  /** POSTs to one endpoint, e.g. 'v1/rigging'. */
  posts(path: string): FakeSeen[];
}

const LETTER: Readonly<Record<string, string>> = {
  'image-to-3d': 'i',
  'multi-image-to-3d': 'm',
  'text-to-3d': 't',
  rigging: 'r',
  animations: 'a',
  retexture: 'x',
};

const reply = (status: number, body: string | Uint8Array, type: string, retryAfter?: string) => ({
  ok: status < 400,
  status,
  headers: {
    get: (n: string) =>
      n === 'content-type' ? type : n === 'retry-after' ? (retryAfter ?? null) : null,
  },
  arrayBuffer: () =>
    Promise.resolve(
      (typeof body === 'string' ? new TextEncoder().encode(body) : body).slice().buffer,
    ),
});
const json = (r: FakeReply) =>
  reply(r.status ?? 200, JSON.stringify(r.body ?? {}), 'application/json', r.retryAfter);

export function fakeMeshy(): FakeMeshy {
  const seen: FakeSeen[] = [];
  const stray: string[] = [];
  const made = new Map<string, number>();
  const fresh = (file: Uint8Array): FakeScript => ({
    create: [],
    polls: [],
    lists: [],
    drop: 0,
    library: [],
    balance: { balance: 1000, monthly_credits: 600, permanent_credits: 400 },
    file,
    fileType: 'model/gltf-binary',
    fileStatus: 200,
    gone: [],
  });
  const me: FakeMeshy = {
    seen,
    stray,
    script: fresh(new Uint8Array()),
    reset(file) {
      seen.length = 0;
      made.clear();
      me.script = fresh(file);
    },
    posts: (path) =>
      seen.filter((s) => s.method === 'POST' && s.url === `${FAKE_API}/openapi/${path}`),
    fetch: (url: string, init: WireInit) => {
      const s = me.script;
      seen.push({
        method: init.method,
        url,
        auth: init.headers['authorization'],
        body: String(init.body ?? ''),
      });
      const u = new URL(url);
      if (u.origin !== FAKE_API && u.origin !== FAKE_CDN) {
        stray.push(url);
        return Promise.reject(`test fetch refused a real host: ${u.origin}`);
      }
      if (u.origin === FAKE_CDN) return Promise.resolve(reply(s.fileStatus, s.file, s.fileType));
      const tail = u.pathname.split('/').pop() ?? '';
      if (init.method === 'POST') {
        const lost = s.drop > 0;
        const r = lost ? {} : (s.create.shift() ?? {});
        const n = (made.get(tail) ?? 0) + ((r.status ?? 200) < 400 ? 1 : 0);
        made.set(tail, n);
        if (lost) {
          s.drop--;
          return Promise.reject('socket hang up');
        }
        return Promise.resolve(
          json({ ...r, body: r.body ?? { result: `${LETTER[tail] ?? 'q'}-${n}` } }),
        );
      }
      if (tail === 'library') return Promise.resolve(json({ body: s.library }));
      if (tail === 'balance') return Promise.resolve(json({ body: s.balance }));
      if (tail in LETTER) return Promise.resolve(json({ body: s.lists.shift() ?? [] }));
      if (s.gone.includes(tail))
        return Promise.resolve(json({ status: 404, body: { message: 'not found' } }));
      return Promise.resolve(json(s.polls.shift() ?? { body: { status: 'IN_PROGRESS' } }));
    },
  };
  return me;
}
