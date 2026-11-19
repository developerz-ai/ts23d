// `t3d concept <recipe.ts|brief.md> [--variants N] [--out dir]`: the concept step as code. CPU:
// a silhouette sheet of N seeded variants of the recipe (render/silhouette-sheet.ts) with scores,
// and `recipes/<name>/concept.ts` — the image prompts, negative prompts, seeds and sizes as
// TypeScript (prompts are part of the recipe: models are random, so the request IS the source;
// written once, then edited by hand and never overwritten). With an `image` adapter configured,
// the requests in concept.ts are filled into the committed cache (recipes/<name>/neural/), from
// where the recipe's `ctx.neural('image', …)` → `ctx.neural('mesh', { image: sha })` chain reads.
// `renderAdapter` is an honest `image` model with no model in it: the recipe's own CPU beauty
// render on white at the request's view (`params.az`, `params.el`): its record says so.

import { basename, dirname, join, resolve } from 'node:path';
import {
  type Asset,
  compile,
  encodePng,
  isTs23dError,
  type NeuralRequests,
  type NeuralResult,
  type NeuralTask,
  Ts23dError,
} from '../core/index.ts';
import {
  type NeuralAdapter,
  type NeuralJob,
  type NeuralModelInfo,
  type NeuralRun,
  neuralCache,
} from '../neural/index.ts';
import { renderBeauty, silhouetteSheet } from '../render/index.ts';
import { type LoadedConfig, loadConfig } from './config.ts';
import { loadAssets } from './load.ts';
import { loadNeuralEntries, neuralDirOf, saveNeuralEntry } from './neural-store.ts';
import { envelope, printError } from './report.ts';

export const RENDER_MODEL: NeuralModelInfo = {
  id: 'ts23d-render',
  task: 'image',
  licence: 'CC0-1.0 (the recipe’s own CPU beauty render on white; no model)',
};

/** The recipe's CPU render as an `image` model: params.az / params.el (degrees), LOD params.lod. */
export function renderAdapter(recipeFile: string): NeuralAdapter {
  return {
    id: `render:${basename(recipeFile)}`,
    tasks: ['image'],
    models: async () => [RENDER_MODEL],
    async run<T extends NeuralTask>(job: NeuralJob<T>): Promise<NeuralRun<T>> {
      const r = job.request as NeuralRequests['image'];
      const p = r.params ?? {};
      const [asset] = await loadAssets(recipeFile);
      if (!asset)
        throw new Ts23dError('T3D_RECIPE_INVALID', {
          cause: `${recipeFile} exports no asset to render`,
          fix: 'export the asset from defineAsset / defineCreature',
        });
      const lod = Number(p['lod'] ?? 0) as 0 | 1 | 2;
      const b = renderBeauty(compile(asset, { lod }), {
        width: r.width,
        height: r.height,
        azDeg: Number(p['az'] ?? -35),
        elDeg: Number(p['el'] ?? 15),
      });
      // On white: the asset's coverage over a plain background (input-image rules).
      const px = new Uint8Array(b.rgba.length);
      for (let i = 0; i < b.mask.length; i++) {
        const a = (b.mask[i] ?? 0) / 255;
        for (let c = 0; c < 3; c++)
          px[i * 4 + c] = Math.round((b.rgba[i * 4 + c] ?? 0) * a + 255 * (1 - a));
        px[i * 4 + 3] = 255;
      }
      const result = { outputs: [{ bytes: encodePng(b.width, b.height, px), mime: 'image/png' }] };
      return { result: result as unknown as NeuralResult<T>, model: RENDER_MODEL };
    },
  };
}

/** concept.ts for a recipe: the prompts and seeds as code (edit, re-roll by changing a seed). */
export function conceptSource(name: string, subject: string): string {
  const q = (s: string): string => JSON.stringify(s);
  return `// Concept requests for ${name} (written by \`t3d concept\`; edit freely, it is never overwritten).
// AI generation is random, so the prompts, seeds and sizes ARE the recipe: \`t3d neural run\` fills
// recipes/${name}/neural/ from them, the recipe reads the images back by request. Re-roll: change a
// seed, \`t3d neural run recipes/${name}/${name}.ts\`, review the images, commit.

import type { NeuralRequests } from '@developerz.ai/ts23d';

/** The image model these were generated with (t3d neural ls). */
export const CONCEPT_MODEL = 'z-image';

const SUBJECT = ${q(subject)};
const NEGATIVE = 'cropped, cut off, busy background, scenery, text, watermark, multiple objects';

/** ¾ view on a plain background: the single-image mesh input (input-image rules). */
export const CONCEPT: NeuralRequests['image'] = {
  seed: 1,
  prompt: \`\${SUBJECT}, three-quarter view, full body in frame, plain white background, studio light\`,
  negative: NEGATIVE,
  width: 768,
  height: 768,
  params: { template: 'concept' },
};

/** Orthographic turnaround (front, side, back): the default mesh mode, the back is not guessed. */
export const TURNAROUND: NeuralRequests['image'] = {
  seed: 1,
  prompt: \`\${SUBJECT}, orthographic turnaround sheet: front, side and back views, plain white background\`,
  negative: NEGATIVE,
  width: 1536,
  height: 512,
  params: { template: 'turnaround' },
};
`;
}

const isImageRequest = (v: unknown): v is NeuralRequests['image'] =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { prompt?: unknown }).prompt === 'string' &&
  Number.isInteger((v as { width?: unknown }).width) &&
  Number.isInteger((v as { height?: unknown }).height) &&
  Number.isInteger((v as { seed?: unknown }).seed);

export interface ConceptResult {
  readonly recipe: string;
  readonly sheet: string | null;
  readonly scores: readonly { readonly label: string; readonly score: number }[];
  readonly concept: string;
  readonly written: boolean;
  readonly images: readonly {
    readonly key: string;
    readonly cached: boolean;
    readonly dir: string;
  }[];
}

/** First paragraph of a brief that is not a heading: the subject of the prompts. */
const subjectOf = (md: string): string =>
  md
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#'))
    ?.replace(/\s+/g, ' ')
    .slice(0, 300) ?? 'an original design';

export async function concept(
  file: string,
  config: LoadedConfig,
  o: { readonly variants?: number; readonly out?: string } = {},
): Promise<ConceptResult> {
  const brief = file.endsWith('.md');
  const dir = dirname(resolve(file));
  const recipe = brief ? basename(dir) : neuralDirOf(file).recipe;
  let sheet: string | null = null;
  let scores: ConceptResult['scores'] = [];
  let subject: string;
  if (brief) subject = subjectOf(await Bun.file(file).text());
  else {
    const [asset] = await loadAssets(file);
    if (!asset)
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `${file} exports no asset`,
        fix: 'export the asset, or pass a brief.md',
      });
    subject = asset.description ?? asset.name;
    const n = o.variants ?? 8;
    const s = silhouetteSheet(variantsOf(asset, n), { cell: 192, cols: 4 });
    sheet = join(o.out ?? join('renders', recipe), 'concept-sheet.png');
    await Bun.write(sheet, s.png);
    scores = s.scores.map((x) => ({ label: x.label, score: x.score }));
  }
  const conceptFile = join(dir, 'concept.ts');
  const written = !(await Bun.file(conceptFile).exists());
  if (written) await Bun.write(conceptFile, conceptSource(recipe, subject));
  const images: { key: string; cached: boolean; dir: string }[] = [];
  const binding = config.neural.get('image' as NeuralTask);
  if (binding) {
    const mod = (await import(conceptFile)) as Record<string, unknown>;
    const model = typeof mod['CONCEPT_MODEL'] === 'string' ? mod['CONCEPT_MODEL'] : binding.model;
    const ndir = join(dir, 'neural');
    const cache = neuralCache({ recipe, entries: await loadNeuralEntries(ndir) });
    for (const request of Object.values(mod).filter(isImageRequest)) {
      const job = { task: 'image' as const, request, ...(model ? { model } : {}) };
      const { entry, cached } = await cache.fill(binding.adapter, job);
      const at = cached ? join(ndir, entry.record.key) : await saveNeuralEntry(ndir, entry);
      images.push({ key: entry.record.key, cached, dir: at });
    }
  }
  return { recipe, sheet, scores, concept: conceptFile, written, images };
}

function variantsOf(
  asset: Asset,
  n: number,
): { label: string; asset: ReturnType<typeof compile> }[] {
  return Array.from({ length: n }, (_, i) => ({
    label: `seed ${i + 1}`,
    asset: compile(asset, { lod: 2, seed: i + 1 }),
  }));
}

/** `t3d concept <recipe.ts|brief.md>…`: prints, returns the exit code. */
export async function conceptMain(
  files: readonly string[],
  o: {
    readonly json: boolean;
    readonly variants?: number;
    readonly out?: string;
    readonly config?: LoadedConfig;
  },
): Promise<number> {
  try {
    if (files.length === 0)
      throw new Ts23dError('T3D_CLI_USAGE', {
        cause: 't3d concept needs a recipe or a brief',
        fix: 'run `t3d concept recipes/<name>/<name>.ts` or `t3d concept recipes/<name>/brief.md`',
      });
    const config = o.config ?? (await loadConfig());
    const runs: ConceptResult[] = [];
    for (const f of files) runs.push(await concept(f, config, o));
    if (o.json) envelope(true, { runs });
    else
      for (const r of runs) {
        if (r.sheet)
          console.log(
            `${r.recipe}: silhouettes → ${r.sheet} (READ it)  ${r.scores.map((s) => `${s.label} ${s.score.toFixed(1)}`).join(' · ')}`,
          );
        console.log(
          `${r.written ? '+' : '='} ${r.concept}${r.written ? '' : ' (kept: edit it by hand)'}`,
        );
        for (const i of r.images)
          console.log(`${i.cached ? '=' : '+'} ${r.recipe} image → ${i.dir}`);
        if (r.images.length === 0)
          console.log(
            `  no image adapter (t3d.config.ts): prompts only; \`t3d neural run\` fills them later`,
          );
      }
    return 0;
  } catch (e) {
    if (isTs23dError(e)) return printError(e, o.json);
    throw e;
  }
}
