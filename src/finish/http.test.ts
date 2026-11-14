// httpFinish against hostile servers: a server that never answers is one T3D_FINISH_MODEL within
// `timeoutMs`, and a reply with the wrong number of images is refused before the cache stores it.

import { describe, expect, it } from 'bun:test';
import { compile, Ts23dError } from '../core/index.ts';
import { cart } from './fixtures.ts';
import { finishAsset, httpFinish, memoryStore } from './index.ts';

const SMALL = { views: 6, size: 64, atlas: 128 } as const;
const lod0 = compile(cart, { lod: 0 });

describe('httpFinish: failures', () => {
  it('a server that never answers + timeoutMs → T3D_FINISH_MODEL within 1 s', async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) });
    try {
      const model = httpFinish({ endpoint: server.url.href, timeoutMs: 50 });
      const t0 = performance.now();
      const e = await finishAsset(lod0, { ...SMALL, prompt: 'x', model }).catch((x: unknown) => x);
      expect(e instanceof Ts23dError && e.code).toBe('T3D_FINISH_MODEL');
      expect(e instanceof Ts23dError && e.fix).toContain('timeoutMs');
      expect(performance.now() - t0).toBeLessThan(1000);
    } finally {
      server.stop(true);
    }
  });

  it('one image for six views → T3D_FINISH_MODEL, cache stays empty', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const model = httpFinish({
      endpoint: 'http://127.0.0.1:9/finish',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ images: [png] }) }),
    });
    const store = memoryStore();
    await expect(finishAsset(lod0, { ...SMALL, prompt: 'x', model, store })).rejects.toThrow(
      'T3D_FINISH_MODEL',
    );
    expect(store.size()).toBe(0);
  });

  it('runCached refuses any model whose image count is wrong, before storing', async () => {
    const model = { id: 'short', licence: 'test', run: async () => [new Uint8Array(4)] };
    const store = memoryStore();
    await expect(finishAsset(lod0, { ...SMALL, prompt: 'x', model, store })).rejects.toThrow(
      'T3D_FINISH_MODEL',
    );
    expect(store.size()).toBe(0);
  });

  it('a non-positive timeoutMs → T3D_FINISH_INVALID', () => {
    expect(() => httpFinish({ endpoint: 'http://x/y', timeoutMs: 0 })).toThrow(
      'T3D_FINISH_INVALID',
    );
  });
});
