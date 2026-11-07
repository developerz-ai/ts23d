// `t3d hero` and `t3d review`: beauty renders and the AI review pack, one folder per asset.
//   <out>/<asset>/hero.png
//   <out>/<asset>/review/{hero,sheet,detail_1,detail_2,lods}.png review.md review.json

import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { type Asset, compile } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { beauty, type ReviewWarning, reviewPack } from '../render/index.ts';
import type { Args } from './args.ts';

export interface RenderResult {
  readonly name: string;
  readonly files: readonly string[];
  readonly warnings: readonly ReviewWarning[];
}

export async function heroOne(
  asset: Asset,
  args: Args,
  sheet: PaintedSheet,
): Promise<RenderResult> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'hero.png');
  await Bun.write(path, beauty(compile(asset, { lod: 0 }), { ...args.render, sheet }));
  return { name: asset.name, files: [path], warnings: [] };
}

/** The dossier: README.md next to the recipe (recipes/<name>/), else a legacy refs/<name>.md. */
async function refsFor(name: string, recipe: string): Promise<string | undefined> {
  for (const p of [
    join(dirname(resolve(recipe)), 'README.md'),
    join(dirname(resolve(recipe)), '..', 'refs', `${name}.md`),
    resolve('refs', `${name}.md`),
  ])
    if (await Bun.file(p).exists()) return relative(process.cwd(), p) || p;
  return undefined;
}

export async function reviewOne(
  asset: Asset,
  recipe: string,
  args: Args,
  sheet: PaintedSheet,
): Promise<RenderResult> {
  const dir = join(args.out, asset.name, 'review');
  await mkdir(dir, { recursive: true });
  const refs = await refsFor(asset.name, recipe);
  const pack = reviewPack(asset, { ...args.render, sheet, ...(refs ? { refs } : {}) });
  const files: string[] = [];
  for (const [name, bytes] of pack.files) {
    const path = join(dir, name);
    await Bun.write(path, bytes);
    files.push(path);
  }
  return { name: asset.name, files, warnings: pack.metrics.warnings };
}

export function printRendered(r: RenderResult): void {
  console.log(
    `${r.name}  ${r.warnings.length ? `${r.warnings.length} warning(s)` : 'no warnings'}`,
  );
  for (const f of r.files) console.log(`  → ${f}`);
  for (const w of r.warnings) console.log(`  ! ${w.code}: ${w.message}\n    fix: ${w.fix}`);
}
