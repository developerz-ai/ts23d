// `t3d hero`, `t3d review` and `t3d blueprint`: beauty renders, the AI review pack and the
// measured blueprint, one folder per asset.
//   <out>/<asset>/hero.png · blueprint.png
//   <out>/<asset>/review/{hero,sheet,detail_1,detail_2,lods}.png review.md review.json

import { mkdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { type Asset, compile, Ts23dError } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { beauty, blueprint, type ReviewWarning, reviewPack } from '../render/index.ts';
import type { Args } from './args.ts';

export interface RenderResult {
  readonly name: string;
  readonly files: readonly string[];
  readonly warnings: readonly ReviewWarning[];
}

/** `--variant` applies to the assets that declare it; the others render their default paint. */
export const variantOf = (asset: Asset, args: Args): string | undefined =>
  args.variant !== undefined && asset.variants?.[args.variant] ? args.variant : undefined;

/** A `--variant` no asset in the file declares is a typo: fail with the names that exist. */
export function wantVariant(assets: readonly Asset[], args: Args, file: string): void {
  if (args.variant === undefined || assets.some((a) => variantOf(a, args))) return;
  const known = assets.flatMap((a) => Object.keys(a.variants ?? {}).map((v) => `${a.name}:${v}`));
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `no asset in ${file} declares variant '${args.variant}'`,
    fix: known.length
      ? `pick one of: ${known.join(', ')}`
      : 'declare it: defineAsset({ paint: { body: "#rrggbb" }, variants: { name: { body: "#rrggbb" } } })',
  });
}

export async function heroOne(
  asset: Asset,
  args: Args,
  sheet: PaintedSheet,
): Promise<RenderResult> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const variant = variantOf(asset, args);
  const path = join(dir, variant ? `hero_${variant}.png` : 'hero.png');
  await Bun.write(
    path,
    beauty(compile(asset, { lod: 0, ...(variant ? { variant } : {}) }), { ...args.render, sheet }),
  );
  return { name: asset.name, files: [path], warnings: [] };
}

/** `t3d blueprint`: measured orthographic views, joints coloured by their QA verdict. */
export async function blueprintOne(asset: Asset, args: Args): Promise<RenderResult> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const variant = variantOf(asset, args);
  const lod0 = compile(asset, { lod: 0, ...(variant ? { variant } : {}) });
  const path = join(dir, variant ? `blueprint_${variant}.png` : 'blueprint.png');
  await Bun.write(path, blueprint(lod0));
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
