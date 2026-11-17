import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveNeuralEntry } from '../../src/cli/neural-store.ts';
import { mockAdapter, neuralCache } from '../../src/neural/index.ts';
import { gitTracked, neuralCacheViolations } from './neural-cache.ts';

const root = await mkdtemp(join(tmpdir(), 'neural-cache-'));
afterAll(() => rm(root, { recursive: true, force: true }));

const request = { seed: 1, prompt: 'p', width: 4, height: 4 };
const untracked = { tracked: async () => ['k/record.json'] };

/** A recipe folder holding one image output, local or committed; returns its paths. */
async function recipe(name: string, keep?: 'local') {
  const dir = join(root, name);
  const job = { task: 'image' as const, request, ...(keep ? { keep } : {}) };
  const { entry } = await neuralCache({ recipe: name }).fill(mockAdapter(), job);
  const at = await saveNeuralEntry(join(dir, 'neural'), entry);
  const file = entry.record.outputs[0]?.file ?? '';
  return { dir, key: entry.record.key, out: join(at, file), file, bytes: entry.outputs[0]?.bytes };
}

describe('neuralCacheViolations (ADR 014)', () => {
  it('a local output tracked by git fails', async () => {
    const r = await recipe('tracked', 'local');
    const v = await neuralCacheViolations(r.dir, { tracked: async () => [`${r.key}/${r.file}`] });
    expect(v.map((x) => x.message).join()).toContain('tracked by git');
    expect(v[0]?.fix).toContain('git rm --cached');
  });

  it('a committed output that is missing or changed fails', async () => {
    const r = await recipe('missing');
    await writeFile(r.out, new Uint8Array([1]));
    expect((await neuralCacheViolations(r.dir))[0]?.message).toContain('output-0.png is changed');
    await rm(r.out);
    expect((await neuralCacheViolations(r.dir))[0]?.message).toContain('output-0.png is missing');
  });

  it('a local output may be missing; present, its sha256 must match', async () => {
    const r = await recipe('local', 'local');
    expect(r.file).toBe('local-0.png');
    expect(await neuralCacheViolations(r.dir, untracked)).toEqual([]);
    await writeFile(r.out, new Uint8Array([1]));
    const v = await neuralCacheViolations(r.dir, untracked);
    expect(v[0]?.message).toContain('local-0.png is changed');
    await rm(r.out);
    expect(await neuralCacheViolations(r.dir, untracked)).toEqual([]);
  });

  it('the cap counts committed bytes only', async () => {
    const local = await recipe('cap-local', 'local');
    expect(await neuralCacheViolations(local.dir, { ...untracked, capBytes: 1 })).toEqual([]);
    const committed = await recipe('cap-committed');
    const v = await neuralCacheViolations(committed.dir, { capBytes: 1 });
    expect(v[0]?.message).toMatch(/committed neural outputs are \d+ bytes, cap 1/);
    expect(await neuralCacheViolations(committed.dir)).toEqual([]);
  });

  it('git cannot say whether a local output is tracked: a violation, not a pass', async () => {
    const r = await recipe('nogit', 'local');
    const v = await neuralCacheViolations(r.dir, {
      tracked: () => Promise.reject(new Error('not a git repository')),
    });
    expect(v[0]?.message).toContain('not a git repository');
    // Outside any checkout the real `git ls-files` refuses.
    await expect(gitTracked(join(r.dir, 'neural'))).rejects.toThrow('git ls-files exited');
  });

  it('this repo: committed caches pass, their files are tracked, none is local', async () => {
    const repo = join(import.meta.dir, '../..');
    for (const name of ['wolf_hybrid', 'human_head'])
      expect(await neuralCacheViolations(join(repo, 'recipes', name))).toEqual([]);
    const tracked = await gitTracked(join(repo, 'recipes/wolf_hybrid/neural'));
    expect(tracked.some((f) => f.endsWith('/record.json'))).toBe(true);
    expect(tracked.some((f) => /\/local-/.test(f))).toBe(false);
    expect(await neuralCacheViolations(join(root, 'none'))).toEqual([]);
  });
});
