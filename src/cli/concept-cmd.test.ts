import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { decodePng } from '../material/index.ts';
import { mockAdapter } from '../neural/index.ts';
import { checkInputImage } from '../render/index.ts';
import { concept, conceptMain, conceptSource, renderAdapter } from './concept-cmd.ts';
import { resolveConfig } from './config.ts';

const dir = join(import.meta.dir, '../../tmp/cli-concept-test');
afterAll(() => rm(dir, { recursive: true, force: true }));
const lib = join(import.meta.dir, '../index.ts');
const file = join(dir, 'crate', 'crate.ts');
const RECIPE = `import { box, defineAsset } from '${lib}';
export const crate = defineAsset({
  name: 'crate',
  kind: 'prop',
  description: 'a wooden crate',
  budget: { triangles: [100, 100, 100] },
  build: (ctx) => ctx.part('body', box({ size: [1, 0.6, 0.3 + ctx.rng.range(0, 0.5)], color: [0.5, 0.4, 0.3] })),
});
`;

describe('t3d concept', () => {
  it('no recipe or brief → usage error (exit 2)', async () => {
    expect(await conceptMain([], { json: true, config: resolveConfig({}) })).toBe(2);
  });

  it('CPU: a silhouette sheet with scores and concept.ts (prompts + seeds as code), kept on rerun', async () => {
    await Bun.write(file, RECIPE);
    const out = join(dir, 'renders');
    const r = await concept(file, resolveConfig({}), { variants: 4, out });
    expect(r.scores.length).toBe(4);
    expect(decodePng(await Bun.file(r.sheet ?? '').bytes()).width).toBeGreaterThan(0);
    expect(r.written).toBe(true);
    const src = await Bun.file(r.concept).text();
    expect(src).toContain('a wooden crate');
    expect(src).toContain('seed: 1');
    await Bun.write(r.concept, src.replace('seed: 1,', 'seed: 7,'));
    const again = await concept(file, resolveConfig({}), { variants: 4, out });
    expect(again.written).toBe(false);
    expect(await Bun.file(r.concept).text()).toContain('seed: 7,');
    expect(r.images).toEqual([]);
  });

  it('with an image adapter: fills every request in concept.ts into neural/', async () => {
    await Bun.write(file, RECIPE);
    await Bun.write(
      join(dir, 'crate', 'concept.ts'),
      conceptSource('crate', 'a crate')
        .replace("'z-image'", "'mock-image'")
        .replaceAll('width: 1536', 'width: 64')
        .replaceAll('width: 768', 'width: 64')
        .replaceAll('height: 768', 'height: 64')
        .replaceAll('height: 512', 'height: 64'),
    );
    const r = await concept(file, resolveConfig({ neural: { image: mockAdapter() } }), {
      variants: 2,
      out: join(dir, 'renders'),
    });
    expect(r.images.length).toBe(2);
    expect((await readdir(join(dir, 'crate', 'neural'))).length).toBe(2);
  });

  it('renderAdapter: the recipe on white, passing the input-image rules', async () => {
    await Bun.write(file, RECIPE);
    const a = renderAdapter(file);
    const run = await a.run({
      task: 'image',
      request: { seed: 1, prompt: 'x', width: 96, height: 96, params: { lod: 2 } },
    });
    const png = decodePng(run.result.outputs[0]?.bytes ?? new Uint8Array());
    expect([png.width, png.height]).toEqual([96, 96]);
    expect(checkInputImage(png.data, 96, 96, { minSide: 96 }).findings).toEqual([]);
    expect(run.model.id).toBe('ts23d-render');
  }, 60_000);
});
