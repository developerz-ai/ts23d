// Offline, content-addressed bytes for imported files (the same convention as CC0 textures):
// library code never reads the disk or the network. A script or the CLI verifies files and hands
// them over with `provideImports`; `importBytes` serves them by sha256, checks inline bytes against
// the declared hash, and fails with T3D_IMPORT_MISSING naming the command that fills the cache.

import { Ts23dError } from '../core/index.ts';
import { sha256Hex } from './sha256.ts';

const SHA = /^[0-9a-f]{64}$/;
const provided = new Map<string, Uint8Array>();

/** Hand verified import bytes (keyed by lower-case hex sha256) to `importGlb`. */
export function provideImports(cache: ReadonlyMap<string, Uint8Array>): void {
  for (const [k, v] of cache) provided.set(k, v);
}

export function importBytes(o: {
  readonly path: string;
  readonly sha256: string;
  readonly bytes?: Uint8Array;
}): Uint8Array {
  if (!SHA.test(o.sha256))
    throw new Ts23dError('T3D_IMPORT_HASH', {
      cause: `'${o.path}': sha256 '${o.sha256}' is not 64 lower-case hex digits`,
      fix: `run \`bun scripts/import.ts hash ${o.path}\` and paste the printed sha256`,
    });
  const bytes = o.bytes ?? provided.get(o.sha256);
  if (!bytes)
    throw new Ts23dError('T3D_IMPORT_MISSING', {
      cause: `'${o.path}' (sha256 ${o.sha256.slice(0, 12)}…) is not in the import cache`,
      fix: `run \`bun scripts/import.ts cache ${o.path}\`, then provideImports(await loadImportCache()) before compiling — or pass the file's bytes as \`bytes\``,
    });
  if (o.bytes) {
    const got = sha256Hex(bytes);
    if (got !== o.sha256)
      throw new Ts23dError('T3D_IMPORT_HASH', {
        cause: `'${o.path}' hashes to ${got}, declared ${o.sha256}: the file changed`,
        fix: 'check the file is the one you licensed, then update `sha256` to the printed value',
      });
  }
  return bytes;
}
