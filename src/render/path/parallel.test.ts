// The worker script resolves in the source tree (worker.ts beside parallel.ts) and in the
// published dist/ (the bundled chunk sits at dist/, the worker at dist/render/path/worker.js).

import { describe, expect, it } from 'bun:test';
import { workerUrl } from './parallel.ts';

const only =
  (...hrefs: string[]) =>
  async (u: URL): Promise<boolean> =>
    hrefs.includes(u.href);

describe('path-tracer worker script', () => {
  it('finds dist/render/path/worker.js from a bundled chunk at dist/', async () => {
    const chunk = 'file:///pkg/dist/chunk-abc123.js';
    const worker = 'file:///pkg/dist/render/path/worker.js';
    expect(await workerUrl(chunk, only(worker))).toBe(worker);
  });

  it('finds worker.js beside an unbundled dist/render/path/parallel.js, worker.ts in src', async () => {
    const js = 'file:///pkg/dist/render/path/worker.js';
    expect(await workerUrl('file:///pkg/dist/render/path/parallel.js', only(js))).toBe(js);
    const ts = new URL('./worker.ts', import.meta.url).href;
    expect(await workerUrl(import.meta.url)).toBe(ts);
  });

  it('answers undefined when no worker script ships (the caller traces in-line)', async () => {
    expect(await workerUrl('file:///pkg/dist/chunk-abc123.js', only())).toBeUndefined();
  });
});
