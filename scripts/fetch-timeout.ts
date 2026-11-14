// A deadline for the network scripts: wraps a fetch (the global one or a test fake) so the request
// is aborted after `ms` and the whole body is read inside that deadline, then handed back
// buffered. A silent server costs one error naming the URL, never an unbounded wait. Every request
// carries browser-like headers (some CDNs refuse bare HTTP clients); a caller's own headers win, so
// Wikidata keeps the identifying User-Agent its API policy requires.

export const FETCH_TIMEOUT_MS = 60_000;
/** Whole-file downloads (a 4K texture zip runs to ~200 MB): ten minutes, not one. */
export const DOWNLOAD_TIMEOUT_MS = 600_000;

export type TimedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Headers a desktop browser sends; merged under the caller's own. */
export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json,text/html;q=0.9,image/avif,image/webp,image/png,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
} as const;

/** The browser headers with the caller's overriding them (case-insensitively). */
export function browserHeaders(own?: HeadersInit): Headers {
  const h = new Headers(BROWSER_HEADERS);
  new Headers(own).forEach((v, k) => {
    h.set(k, v);
  });
  return h;
}

/** Statuses whose Response may not carry a body. */
const NO_BODY = new Set([101, 103, 204, 205, 304]);

export function withTimeout(get: TimedFetch, ms = FETCH_TIMEOUT_MS): TimedFetch {
  return async (url, init = {}) => {
    const signal = AbortSignal.timeout(ms);
    const timedOut = new Promise<never>((_, reject) =>
      signal.addEventListener(
        'abort',
        () =>
          reject(
            new Error(
              `GET ${url}: no complete answer within ${ms / 1000} s\nfix: check the network and the server, then rerun`,
            ),
          ),
        { once: true },
      ),
    );
    const read = async (): Promise<Response> => {
      const res = await get(url, { ...init, headers: browserHeaders(init.headers), signal });
      const body = NO_BODY.has(res.status) ? null : await res.arrayBuffer();
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    };
    return Promise.race([read(), timedOut]);
  };
}
