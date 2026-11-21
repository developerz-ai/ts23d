import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { compile } from '../core/index.ts';
import { mockAdapter, parseRecord } from '../neural/index.ts';
import { resolveConfig } from './config.ts';
import { loadAssets } from './load.ts';
import { neuralLs, neuralMain, neuralRun, ROUNDS } from './neural-cmd.ts';
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
/** The rock recipe in a folder of its own, so no test sees another's cache (any order runs). */
async function rockFile(test: string): Promise<string> {
  const file = join(dir, test, 'rock', 'rock.ts');
  await Bun.write(file, RECIPE);
  return file;
}
const quiet = { json: true } as const;

describe('t3d neural', () => {
  it('no adapter for the task: run leaves it missing; --require-neural → T3D_NEURAL_MISSING', async () => {
    const file = await rockFile('none');
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
    const file = await rockFile('offline');
    const [rock] = await loadAssets(file);
    if (!rock) throw new Error('no asset');
    await provideRecipeNeural(file, ['rock'], true);
    expect(() => compile(rock, { lod: 0 })).toThrow('T3D_NEURAL_MISSING');
    const cache = await provideRecipeNeural(file, ['rock'], false);
    compile(rock, { lod: 0 });
    expect(cache.notices().length).toBe(1);
  });

  it('run fills recipes/<name>/neural/<key>/ once; a build then hits it offline', async () => {
    const file = await rockFile('fills');
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
    const file = await rockFile('hit');
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

  /** A chain: a local (never committed) image names the input of a committed ktx2. */
  const CHAIN = `import { box, defineAsset } from '${lib}';
export const chain = defineAsset({
  name: 'chain',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    const raw = ctx.neural('image', { seed: 7, prompt: 'raw', width: 4, height: 4 }, { keep: 'local' })?.outputs[0];
    const k = raw?.sha256
      ? ctx.neural('ktx2', { seed: 0, image: { sha256: raw.sha256, mime: raw.mime }, mode: 'uastc' }, { inputs: new Map([[raw.sha256, raw.bytes]]) })
      : null;
    ctx.part('body', box({ size: [1, 1, k ? 1 : 0.5], color: [0.5, 0.5, 0.5] }));
  },
});
`;

  it('local outputs: without the upstream file the chain is all hits; a miss fed by it is not sent', async () => {
    const f = join(dir, 'chain', 'chain.ts');
    const ndir = join(dir, 'chain', 'neural');
    await rm(join(dir, 'chain'), { recursive: true, force: true });
    await Bun.write(f, CHAIN);
    const adapter = mockAdapter();
    const config = resolveConfig({ neural: { image: adapter, ktx2: adapter } });
    // A rule the user already keeps in neural/.gitignore survives the first local output.
    await Bun.write(join(ndir, '.gitignore'), 'scratch/\n');
    const made = await neuralRun(f, config, true);
    expect([made.filled.map((x) => x.task).sort(), adapter.calls()]).toEqual([
      ['image', 'ktx2'],
      2,
    ]);
    const image = made.filled.find((x) => x.task === 'image')?.dir ?? '';
    const ktx2 = made.filled.find((x) => x.task === 'ktx2')?.dir ?? '';
    expect((await readdir(image)).sort()).toEqual(['local-0.png', 'record.json']);
    expect(await readFile(join(ndir, '.gitignore'), 'utf8')).toContain('\n*/local-*\n');
    expect(await readFile(join(ndir, '.gitignore'), 'utf8')).toMatch(/^scratch\/\n/);
    // A build never reads a local file, even here: the same build on every machine.
    expect((await provideRecipeNeural(f, ['chain'], true)).absentLocal().size).toBe(1);
    // A fresh clone: the local file never left the machine that made it.
    await rm(join(image, 'local-0.png'));
    const clone = await neuralRun(f, config, true);
    expect(clone.filled.map((x) => [x.task, x.cached, x.absent])).toEqual([
      ['image', true, true],
      ['ktx2', true, undefined],
    ]);
    expect([clone.missing.length, adapter.calls()]).toEqual([0, 2]);
    const [chain] = await loadAssets(f);
    if (!chain) throw new Error('no asset');
    const cache = await provideRecipeNeural(f, ['chain'], true);
    compile(chain, { lod: 0 });
    expect(cache.notices().length).toBe(0);
    // The downstream output is gone too: its input has no bytes here, so nothing is sent.
    await rm(ktx2, { recursive: true });
    const stuck = await neuralRun(f, config, false);
    expect(stuck.missing.length).toBe(1);
    expect(stuck.missing[0]?.message).toMatch(
      /ktx2 request not sent: input [0-9a-f]{12}… is a local output not on this machine/,
    );
    expect(stuck.missing[0]?.fix).toContain('re-run the upstream request here');
    expect(adapter.calls()).toBe(2);
    await expect(neuralRun(f, config, true)).rejects.toThrow('T3D_NEURAL_MISSING');
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

describe('neural run rounds', () => {
  it('covers the longest request chain: image → mesh → proxy → rig → final', () => {
    // One round fills one link; fewer rounds would leave a model body's last ask unfilled.
    expect(ROUNDS).toBeGreaterThanOrEqual(5);
  });

  it('a chain longer than ROUNDS: the request after the last round is missing, not dropped', async () => {
    const f = join(dir, 'ladder', 'ladder.ts');
    await rm(join(dir, 'ladder'), { recursive: true, force: true });
    // Each request appears only once the one before it has an output: ROUNDS + 1 links.
    await Bun.write(
      f,
      `import { box, defineAsset } from '${lib}';
export const ladder = defineAsset({
  name: 'ladder',
  kind: 'prop',
  budget: { triangles: [12, 12, 12] },
  build: (ctx) => {
    for (let i = 0; i < ${ROUNDS + 1}; i++)
      if (!ctx.neural('image', { seed: i, prompt: 'rung', width: 4, height: 4 })) break;
    ctx.part('body', box({ size: [1, 1, 1], color: [0.5, 0.5, 0.5] }));
  },
});
`,
    );
    const config = resolveConfig({ neural: { image: mockAdapter() } });
    const r = await neuralRun(f, config, false);
    expect([r.filled.length, r.missing.length]).toEqual([ROUNDS, 1]);
    expect(r.missing[0]?.message).toMatch(new RegExp(`after ${ROUNDS} rounds`));
    await rm(join(dir, 'ladder', 'neural'), { recursive: true, force: true });
    await expect(neuralRun(f, config, true)).rejects.toThrow(
      new RegExp(`T3D_NEURAL_MISSING: .*${ROUNDS} rounds`),
    );
    // The rerun fills the last link; then the chain is complete.
    const done = await neuralRun(f, config, true);
    expect([done.filled.length, done.missing.length]).toEqual([ROUNDS + 1, 0]);
  });
});
