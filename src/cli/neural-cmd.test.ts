import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { compile } from '../core/index.ts';
import { mockAdapter, parseRecord } from '../neural/index.ts';
import { resolveConfig } from './config.ts';
import { loadAssets } from './load.ts';
import { neuralLs, neuralMain, neuralRun } from './neural-cmd.ts';
import { provideRecipeNeural } from './neural-store.ts';

const dir = join(import.meta.dir, '../../tmp/cli-neural-test');
afterAll(() => rm(dir, { recursive: true, force: true }));
const lib = join(import.meta.dir, '../index.ts');

/** A recipe that asks the cache for an image the way ctx.neural (plan slice 15) will. */
const RECIPE = `import { box, defineAsset, providedNeural } from '${lib}';
export const rock = defineAsset({
  name: 'rock',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    const r = providedNeural('rock').get('image', { seed: 1, prompt: 'lichen', width: 4, height: 4 });
    const h = r.fallback ? 0.5 : 1;
    ctx.part('body', box({ size: [1, 1, h], color: [0.5, 0.5, 0.5] }));
  },
});
`;
const file = join(dir, 'rock', 'rock.ts');
const quiet = { json: true } as const;

describe('t3d neural', () => {
  it('no adapter for the task: run leaves it missing; --require-neural → T3D_NEURAL_MISSING', async () => {
    await Bun.write(file, RECIPE);
    const none = resolveConfig({});
    const r = await neuralRun(file, none, false);
    expect([r.filled.length, r.missing.length]).toEqual([0, 1]);
    expect(r.missing[0]?.fix).toContain('t3d neural run');
    await expect(neuralRun(file, none, true)).rejects.toThrow('T3D_NEURAL_MISSING');
    expect(await neuralMain(['run', file], { ...quiet, requireNeural: true, config: none })).toBe(
      1,
    );
    expect(await neuralMain(['dance'], { ...quiet, requireNeural: false, config: none })).toBe(2);
  });

  it('build offline before a run: fallback; --require-neural: the compile throws', async () => {
    await Bun.write(file, RECIPE);
    const [rock] = await loadAssets(file);
    if (!rock) throw new Error('no asset');
    await provideRecipeNeural(file, ['rock'], true);
    expect(() => compile(rock, { lod: 0 })).toThrow('T3D_NEURAL_MISSING');
    const cache = await provideRecipeNeural(file, ['rock'], false);
    compile(rock, { lod: 0 });
    expect(cache.notices().length).toBe(1);
  });

  it('run fills recipes/<name>/neural/<key>/ once; a build then hits it offline', async () => {
    await Bun.write(file, RECIPE);
    const adapter = mockAdapter();
    const config = resolveConfig({ neural: { image: adapter } });
    const first = await neuralRun(file, config, true);
    const again = await neuralRun(file, config, true);
    // The second run is a full cache hit: reported as one cached entry, the model not called again.
    expect([first.filled[0]?.cached, again.filled.length, again.filled[0]?.cached]).toEqual([
      false,
      1,
      true,
    ]);
    expect(adapter.calls()).toBe(1);
    const keyDir = first.filled[0]?.dir ?? '';
    expect((await readdir(keyDir)).sort()).toEqual(['output-0.png', 'record.json']);
    const record = parseRecord(await readFile(join(keyDir, 'record.json'), 'utf8'), 'record.json');
    expect([record.model.id, record.task, record.adapter]).toEqual(['mock-image', 'image', 'mock']);
    const [rock] = await loadAssets(file);
    if (!rock) throw new Error('no asset');
    const cache = await provideRecipeNeural(file, ['rock'], true);
    compile(rock, { lod: 0 });
    expect(cache.notices().length).toBe(0);
    const ls = await neuralLs(config);
    expect(ls.map((m) => m.id)).toEqual(['mock-image']);
  });

  it('a full cache hit prints the cached entry, not "asks for no neural outputs"', async () => {
    await Bun.write(file, RECIPE);
    const config = resolveConfig({ neural: { image: mockAdapter() } });
    await neuralRun(file, config, true);
    const lines: string[] = [];
    const log = console.log;
    console.log = (m: string) => void lines.push(m);
    try {
      expect(await neuralMain(['run', file], { json: false, requireNeural: true, config })).toBe(0);
    } finally {
      console.log = log;
    }
    expect(lines.join('\n')).toMatch(/^= rock image mock-image/);
    expect(lines.join('\n')).not.toContain('asks for no neural outputs');
  });

  it('ctx.neural reads the same cache: null before the run, the output after', async () => {
    const ctxFile = join(dir, 'pebble', 'pebble.ts');
    await Bun.write(
      ctxFile,
      `import { box, defineAsset } from '${lib}';
export const pebble = defineAsset({
  name: 'pebble',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    const r = ctx.neural('image', { seed: 2, prompt: 'grit', width: 4, height: 4 });
    ctx.part('body', box({ size: [1, 1, r ? 1 : 0.5], color: [0.5, 0.5, 0.5] }));
  },
});
`,
    );
    const [pebble] = await loadAssets(ctxFile);
    if (!pebble) throw new Error('no asset');
    const top = (): number => Math.max(...(compile(pebble).parts[0]?.mesh?.positions ?? [0]));
    await provideRecipeNeural(ctxFile, ['pebble'], false);
    expect(top()).toBeCloseTo(0.5, 6);
    await neuralRun(ctxFile, resolveConfig({ neural: { image: mockAdapter() } }), true);
    await provideRecipeNeural(ctxFile, ['pebble'], true);
    expect(top()).toBeCloseTo(1, 6);
  });

  /** A recipe sending a 600² image to the mesh task: a clean subject, or the snow-photo clutter. */
  const meshRecipe = (
    clutter: boolean,
  ) => `import { box, defineAsset, encodePng, sha256Hex } from '${lib}';
const w = 600;
const px = new Uint8Array(w * w * 4);
for (let y = 0; y < w; y++)
  for (let x = 0; x < w; x++) {
    const g = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
    const blob = ((x - 300) / 200) ** 2 + ((y - 300) / 150) ** 2 <= 1;
    const bg = ${clutter} ? (x % 70 < 9 ? 40 + 30 * g : 200 + 50 * g) : 250;
    const v = blob ? 70 + 90 * g : bg;
    px.set([v, v, v, 255], (y * w + x) * 4);
  }
const png = encodePng(w, w, px);
const sha256 = sha256Hex(png);
export const scan = defineAsset({
  name: 'scan',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    const r = ctx.neural('mesh', { seed: 1, image: { sha256, mime: 'image/png' } }, { inputs: new Map([[sha256, png]]) });
    ctx.part('body', box({ size: [1, 1, r ? 1 : 0.5], color: [0.5, 0.5, 0.5] }));
  },
});
`;

  it('D55: a cluttered mesh input is T3D_NEURAL_INPUT before any GPU time; a clean one goes', async () => {
    const f = join(dir, 'scan', 'scan.ts');
    await rm(join(dir, 'scan'), { recursive: true, force: true });
    await Bun.write(f, meshRecipe(true));
    const adapter = mockAdapter();
    const config = resolveConfig({ neural: { mesh: adapter } });
    await expect(neuralRun(f, config, false)).rejects.toThrow(
      /T3D_NEURAL_INPUT: .*background.*subjects/,
    );
    expect(adapter.calls()).toBe(0);
    // A fresh path: the module loader caches recipes by path.
    const g = join(dir, 'clean', 'clean.ts');
    await Bun.write(g, meshRecipe(false));
    const ok = await neuralRun(g, config, false);
    expect([ok.filled.length, ok.notices.length, adapter.calls()]).toEqual([1, 0, 1]);
  });

  it('--allow-bad-input sends it anyway and records the override in record.json', async () => {
    const f = join(dir, 'bad', 'bad.ts');
    await Bun.write(f, meshRecipe(true));
    const r = await neuralRun(f, resolveConfig({ neural: { mesh: mockAdapter() } }), false, {
      allowBadInput: true,
    });
    expect(r.notices.join(' ')).toContain('allow-bad-input');
    const record = parseRecord(
      await readFile(join(r.filled[0]?.dir ?? '', 'record.json'), 'utf8'),
      'r',
    );
    expect(record.overrides?.some((o) => o.includes('background'))).toBe(true);
  });
});
