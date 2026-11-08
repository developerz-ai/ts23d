import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheImport, loadImportCache, main } from './import.ts';

describe('scripts/import', () => {
  test('unknown command and missing file argument exit 1', async () => {
    expect(await main(['nope'])).toBe(1);
    expect(await main(['hash'])).toBe(1);
  });
  test('cache stores by sha256; load re-verifies and skips tampered entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 't3d-import-'));
    try {
      const file = join(dir, 'a.glb');
      await Bun.write(file, new Uint8Array([1, 2, 3, 4]));
      const cache = join(dir, 'cache');
      const sha = await cacheImport(file, cache);
      expect(sha).toBe(
        new Bun.CryptoHasher('sha256').update(new Uint8Array([1, 2, 3, 4])).digest('hex'),
      );
      expect([...(await loadImportCache(cache)).keys()]).toEqual([sha]);
      await Bun.write(join(cache, `${sha}.glb`), new Uint8Array([9]));
      expect((await loadImportCache(cache)).size).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
