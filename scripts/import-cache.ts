// Re-export: the import cache lives in src/cli so `t3d build` can read it.
export { cacheImport, IMPORT_CACHE, loadImportCache, sha256 } from '../src/cli/import-cache.ts';
