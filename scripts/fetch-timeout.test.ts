import { describe, expect, it } from 'bun:test';
import { BROWSER_HEADERS, withTimeout } from './fetch-timeout.ts';

describe('withTimeout', () => {
  it('a server that never answers fails within the deadline, naming the URL', async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) });
    try {
      const t0 = performance.now();
      const e = await withTimeout(fetch, 50)(server.url.href).catch((x: unknown) => x);
      expect(String(e)).toContain(server.url.href);
      expect(performance.now() - t0).toBeLessThan(1000);
    } finally {
      server.stop(true);
    }
  });

  it('a body that never finishes also fails within the deadline', async () => {
    const stall = new ReadableStream({ start: (c) => c.enqueue(new Uint8Array([1])) });
    const get = async () => new Response(stall);
    const t0 = performance.now();
    const e = await withTimeout(get, 50)('http://x/slow').catch((x: unknown) => x);
    expect(String(e)).toContain('no complete answer');
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it('passes a prompt answer through, status and body intact', async () => {
    const get = async () => new Response('hello', { status: 201 });
    const res = await withTimeout(get, 1000)('http://x/ok');
    expect([res.status, await res.text()]).toEqual([201, 'hello']);
  });

  it('sends browser-like headers, caller headers winning', async () => {
    const seen: Headers[] = [];
    const get = async (_u: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response('ok');
    };
    await withTimeout(get, 1000)('http://x/a');
    await withTimeout(get, 1000)('http://x/b', { headers: { 'user-agent': 'ts23d-data' } });
    expect(seen[0]?.get('user-agent')).toBe(BROWSER_HEADERS['User-Agent']);
    expect(seen[0]?.get('accept-language')).toBe('en-US,en;q=0.9');
    expect(seen[1]?.get('user-agent')).toBe('ts23d-data');
    expect(seen[1]?.get('accept')).toBe(BROWSER_HEADERS.Accept);
  });
});
