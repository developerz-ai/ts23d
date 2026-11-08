import { describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { recipeFolders } from './files.ts';

async function tree(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ts23d-files-'));
  for (const f of files) {
    await mkdir(join(root, dirname(f)), { recursive: true });
    await writeFile(join(root, f), 'export {};\n');
  }
  return root;
}

describe('recipeFolders', () => {
  it('rejects .ts outside an asset folder and inside a folder without an entry', async () => {
    const root = await tree(['recipes/loose.ts', 'recipes/orphan/wings.ts']);
    const { folders, stray } = await recipeFolders(root);
    expect(folders).toEqual([]);
    expect(stray.sort()).toEqual(['recipes/loose.ts', 'recipes/orphan/wings.ts']);
  });

  it('accepts an asset split into modules, nested ones included, and shared _ folders', async () => {
    const root = await tree([
      'recipes/dragon/dragon.ts',
      'recipes/dragon/head.ts',
      'recipes/dragon/parts/wing.ts',
      'recipes/_lib/rivets.ts',
    ]);
    const { folders, stray } = await recipeFolders(root);
    expect(folders).toEqual([{ dir: 'recipes/dragon', file: 'recipes/dragon/dragon.ts' }]);
    expect(stray).toEqual([]);
  });

  it('still rejects .ts under an asset out/ folder', async () => {
    const root = await tree(['recipes/dragon/dragon.ts', 'recipes/dragon/out/x.ts']);
    expect((await recipeFolders(root)).stray).toEqual(['recipes/dragon/out/x.ts']);
  });
});
