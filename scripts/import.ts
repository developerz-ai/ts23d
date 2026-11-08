// Imported meshes, from the command line (the library itself never touches the disk):
//   bun scripts/import.ts hash <file.glb>        print the sha256 to declare in ImportSource
//   bun scripts/import.ts cache <file.glb>…      verify + store under node_modules/.cache/ts23d/imports
//   bun scripts/import.ts fixture [out.glb]      write the import demo's stand-in scan GLB
//   bun scripts/import.ts textured [outDir]      the demo's own-texture GLB (bake + extra material)
// Before compiling a recipe that imports a cached file: provideImports(await loadImportCache()).

import { sha256 as hashOf } from './import-cache.ts';

export { cacheImport, IMPORT_CACHE, loadImportCache } from './import-cache.ts';

const USAGE = 'usage: bun scripts/import.ts hash|cache|fixture|textured [args]';

export async function main(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === 'hash' || cmd === 'cache') {
    if (!rest.length) {
      console.error(USAGE);
      return 1;
    }
    const { cacheImport } = await import('./import-cache.ts');
    for (const f of rest) {
      const bytes = new Uint8Array(await Bun.file(f).arrayBuffer());
      const sha = cmd === 'cache' ? await cacheImport(f) : hashOf(bytes);
      console.log(`${sha}  ${f}${cmd === 'cache' ? '  (cached)' : ''}`);
    }
    return 0;
  }
  if (cmd === 'fixture') {
    const { scanGlb } = await import('../recipes/import_demo/scan.ts');
    const out = rest[0] ?? 'tmp/import/scan.glb';
    const glb = scanGlb();
    await Bun.write(out, glb);
    console.log(`${hashOf(glb)}  ${out}  (${glb.byteLength} bytes, CC0 stand-in scan)`);
    return 0;
  }
  if (cmd === 'textured') {
    const { texturedDemo } = await import('./import-textured.ts');
    const r = await texturedDemo(rest[0] ?? 'tmp/import');
    console.log(
      `${r.glb}  ${r.bytes} bytes, ${r.size}² bake, hit rate ${(r.hitRate * 100).toFixed(1)}%`,
    );
    return 0;
  }
  console.error(USAGE);
  return 1;
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
