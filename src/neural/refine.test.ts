import { describe, expect, test } from 'bun:test';
import { Ts23dError } from '../core/index.ts';
import { cube } from './fixtures.ts';
import { readGlb } from './glb-read.ts';
import { writeMeshGlb } from './glb-write.ts';
import { type RefineCache, refine } from './refine.ts';

const store = (): RefineCache & { size: () => number } => {
  const m = new Map<string, Uint8Array>();
  return { get: (k) => m.get(k), set: (k, v) => void m.set(k, v), size: () => m.size };
};

describe('refine (mock local server)', () => {
  test('offline miss → T3D_REFINE_FAILED naming the key', async () => {
    const e = await refine(
      { mesh: cube(), prompt: 'weathered' },
      { endpoint: 'http://x', model: 'm', cache: store(), offline: true },
    ).catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_REFINE_FAILED');
  });
  test('a non-GLB answer → T3D_REFINE_FAILED', async () => {
    const fetch = async (): Promise<Response> => new Response('oops', { status: 500 });
    const e = await refine(
      { mesh: cube(), prompt: 'p' },
      { endpoint: 'http://x', model: 'm', cache: store(), fetch },
    ).catch((x: unknown) => x);
    expect(e instanceof Ts23dError && e.code).toBe('T3D_REFINE_FAILED');
  });
  test('posts a Y-up GLB once, then serves the cache', async () => {
    const calls: string[] = [];
    const answer = writeMeshGlb([{ name: 'refined', mesh: cube([2, 2, 2]) }]);
    const fetch = async (url: string, init: RequestInit): Promise<Response> => {
      calls.push(url);
      const body = JSON.parse(String(init.body)) as { model: string; prompt: string; mesh: string };
      expect(body.model).toBe('trellis-2');
      const glb = Uint8Array.from(atob(body.mesh), (c) => c.charCodeAt(0));
      expect(readGlb(glb).json['meshes']).toBeDefined();
      return new Response(new Blob([new Uint8Array(answer)]));
    };
    const cache = store();
    const o = { endpoint: 'http://127.0.0.1:8190/refine', model: 'trellis-2', cache, fetch };
    const a = await refine({ mesh: cube(), prompt: 'add pores', seed: 3 }, o);
    const b = await refine({ mesh: cube(), prompt: 'add pores', seed: 3 }, o);
    expect(calls.length).toBe(1);
    expect([a.cached, b.cached]).toEqual([false, true]);
    expect(b.key).toBe(a.key);
    expect(Buffer.from(b.glb).equals(Buffer.from(answer))).toBe(true);
    const c = await refine({ mesh: cube(), prompt: 'add pores', seed: 4 }, o);
    expect(c.key).not.toBe(a.key);
    expect(cache.size()).toBe(2);
  });
});
