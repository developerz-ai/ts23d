// wire.ts: HTTP 429 waits as long as the server's Retry-After asks (seconds or an HTTP date), never
// less than the backoff, and never past the `retryForMs` budget. A stub fetch and an injected
// pause: no network, no real waiting.

import { describe, expect, it } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { type WireFetch, type WireReply, wireJson } from './wire.ts';

const reply = (status: number, headers: Record<string, string> = {}): WireReply => {
  const h = new Map(Object.entries({ 'content-type': 'application/json', ...headers }));
  return {
    ok: status < 400,
    status,
    headers: { get: (n) => h.get(n.toLowerCase()) ?? null },
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode('{"ok":1}').buffer as ArrayBuffer),
  };
};

/** Replies in order; records every pause instead of waiting. */
function stub(replies: WireReply[]) {
  const waits: number[] = [];
  const fetch: WireFetch = () => Promise.resolve(replies.shift() ?? reply(200));
  return {
    waits,
    o: {
      timeoutMs: 1000,
      maxBytes: 1024,
      fetch,
      retryForMs: 120_000,
      backoffMs: 10,
      pause: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
    },
  };
}

describe('wire: HTTP 429 and Retry-After', () => {
  it('Retry-After in seconds is waited, not the 10 ms backoff', async () => {
    const { o, waits } = stub([reply(429, { 'retry-after': '7' }), reply(200)]);
    expect(await wireJson(o, 'http://x/a', 'call')).toEqual({ ok: 1 });
    expect(waits).toEqual([7000]);
  });

  it('Retry-After as an HTTP date waits until then', async () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    const { o, waits } = stub([reply(429, { 'retry-after': at }), reply(200)]);
    await wireJson(o, 'http://x/a', 'call');
    expect(waits.length).toBe(1);
    expect(waits[0]).toBeGreaterThan(27_000);
    expect(waits[0]).toBeLessThanOrEqual(30_000);
  });

  it('the backoff wins when longer; no or a bad Retry-After keeps the backoff', async () => {
    const { o, waits } = stub([
      reply(429, { 'retry-after': '0' }),
      reply(429, { 'retry-after': 'soon' }),
      reply(429),
      reply(200),
    ]);
    await wireJson(o, 'http://x/a', 'call');
    expect(waits).toEqual([10, 20, 40]);
  });

  it('a Retry-After past the retryForMs budget fails now, naming the wait', async () => {
    const { o, waits } = stub([reply(429, { 'retry-after': '600' })]);
    const e = await wireJson(o, 'http://x/a', 'call').catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_NEURAL_FAILED');
    expect(e instanceof Ts23dError && e.message).toMatch(/HTTP 429.*Retry-After 600 s/);
    expect(waits).toEqual([]);
  });
});
