// Command dispatch for `t3d`. Pure function of argv → exit code, so it is testable in-process.
// Exit: 0 ok · 1 QA findings or a coded error · 2 usage (T3D_CLI_USAGE). A failing file or asset
// does not stop a multi-recipe run: its coded error joins data[] and the run exits 1.
// Output layout, one folder per asset (stable paths agents and pipelines can rely on):
//   <out>/<asset>/lod0.glb lod1.glb lod2.glb <asset>.glb (all LODs, MSFT_lod) hero.png thumb.png
//   sheet.png manifest.json · blueprint.png (t3d blueprint) · gaps/ (t3d gaps)
//   icon.png portrait.png rts.png (t3d icon: UI art, one fixed 3/4 high camera)
//   with --variant <v>: hero_<v>.png sheet_<v>.png thumb_<v>.png
//   <out>/<asset>/review/… (t3d review) · <out>/index.json — every asset built into <out>, by name,
//   with its QA verdict (merged with the index already there)

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, Ts23dError } from '../core/index.ts';
import { SHEET_MAPS, type SheetBinding, sheetFileName, sheetPngs } from '../export/index.ts';
import {
  DEFAULT_SHEET,
  type PaintedSheet,
  paintTrimSheet,
  provideTextures,
} from '../material/index.ts';
import { provideImports } from '../neural/index.ts';
import { type Args, parseArgs } from './args.ts';
import { buildOne } from './build-one.ts';
import { critiqueOne } from './critique-cmd.ts';
import { finishOne } from './finish-cmd.ts';
import { gapsOne } from './gaps-cmd.ts';
import { helpText, versionOf } from './help.ts';
import { iconOne } from './icon-cmd.ts';
import { loadImportCache } from './import-cache.ts';
import { writeIndex } from './index-json.ts';
import { loadAssets, recipeThrew } from './load.ts';
import type { AssetManifest } from './manifest.ts';
import {
  blueprintOne,
  heroOne,
  printRendered,
  type RenderResult,
  reviewOne,
  wantVariant,
} from './render-cmds.ts';
import {
  envelope,
  type Failed,
  jsonStdout,
  printError,
  printFailed,
  printManifest,
} from './report.ts';
import { loadTextureCache } from './texture-cache.ts';
import { printTune, type TuneRun, tuneFile } from './tune-cmd.ts';

const RENDERS = ['hero', 'review', 'critique', 'icon', 'finish'];

/** A throw outside any recipe (texture cache, disk) still leaves with a code and a fix. */
function outside(e: unknown): Ts23dError {
  if (e instanceof Ts23dError) return e;
  return new Ts23dError('T3D_RECIPE_THREW', {
    cause: `t3d failed outside a recipe: ${e instanceof Error ? e.message : String(e)}`,
    fix: 'check the files t3d reads and writes (.ts23d/, --out); if it persists, open an issue with the command line',
  });
}

export async function run(argv: readonly string[]): Promise<number> {
  const json = argv.includes('--json');
  // Under --json stdout carries only the envelope: human lines (and recipes' logs) go to stderr.
  const restore = json ? jsonStdout() : () => {};
  try {
    return await dispatch(argv, json);
  } catch (e) {
    return printError(outside(e), json);
  } finally {
    restore();
  }
}

async function dispatch(argv: readonly string[], json: boolean): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    if (!json && e.code === 'T3D_CLI_USAGE' && e.message.includes('unknown command'))
      console.error(`${helpText()}\n`);
    return printError(e, json);
  }
  if (args.cmd === 'help' || args.cmd === 'version') {
    const text = args.cmd === 'help' ? helpText(args.topic) : await versionOf();
    if (json) envelope(true, args.cmd === 'help' ? { help: text } : { version: text });
    else console.log(text);
    return 0;
  }
  if (args.cmd === 'tune') return tuneAll(args);
  const renders = RENDERS.includes(args.cmd);
  const painted = await prepareSheet(args, renders);
  const texture = await sheetBinding(args, painted);
  const built: AssetManifest[] = [];
  const rendered: RenderResult[] = [];
  const listed: { asset: string; file: string }[] = [];
  const failed: Failed[] = [];
  const seen = new Map<string, string>();
  for (const file of args.files) {
    let assets: Asset[];
    try {
      assets = await loadAssets(file);
      wantVariant(assets, args, file);
    } catch (e) {
      failed.push({ file, error: recipeThrew(e, file, `loading ${file}`).toJSON() });
      continue;
    }
    for (const asset of assets) {
      const twin = seen.get(asset.name);
      if (twin !== undefined) {
        failed.push({ file, asset: asset.name, error: duplicate(asset.name, twin, file).toJSON() });
        continue;
      }
      seen.set(asset.name, file);
      try {
        if (args.cmd === 'list') listed.push({ asset: asset.name, file });
        else if (args.cmd === 'blueprint') rendered.push(await blueprintOne(asset, args));
        else if (args.cmd === 'gaps') rendered.push(await gapsOne(asset, args));
        else if (renders && painted) rendered.push(await renderOne(asset, file, args, painted));
        else built.push(await buildOne(asset, args, texture, painted));
      } catch (e) {
        const error = recipeThrew(e, file, `${asset.name}'s build()`).toJSON();
        failed.push({ file, asset: asset.name, error });
      }
    }
  }
  if (!json) failed.forEach(printFailed);
  if (args.cmd === 'list')
    return finish(json, failed, listed, (l) => console.log(`${l.asset}  ${l.file}`));
  if (renders || args.cmd === 'blueprint' || args.cmd === 'gaps') {
    // An undeclared slit is a QA failure: `t3d gaps` exits 1 like `t3d build`.
    // Rejected finishes (T3D_FINISH_*) and QA findings on the finished asset exit 1 too.
    const clean =
      (args.cmd !== 'gaps' && args.cmd !== 'finish') ||
      rendered.every((r) => r.warnings.length === 0);
    return finish(json, failed, rendered, printRendered, clean);
  }
  if (built.length) await writeIndex(args.out, built);
  return finish(
    json,
    failed,
    built,
    (m) => printManifest(m, join(args.out, m.name)),
    built.every((m) => m.qa.pass),
  );
}

/** The run's one output: envelope or human lines; exit 1 on any failure or finding. */
function finish<T>(
  json: boolean,
  failed: readonly Failed[],
  items: readonly T[],
  print: (item: T) => void,
  clean = true,
): number {
  const ok = clean && failed.length === 0;
  if (json) envelope(ok, [...items, ...failed], failed[0]?.error);
  else items.forEach(print);
  return ok ? 0 : 1;
}

function duplicate(name: string, first: string, again: string): Ts23dError {
  return new Ts23dError('T3D_ASSET_DUPLICATE', {
    cause: `two assets are named '${name}' (${first}${first === again ? '' : ` and ${again}`}); both would write <out>/${name}/`,
    fix: `rename one: defineAsset({ name: '${name}_2', … }) — asset names are folder and index keys`,
  });
}

function renderOne(
  asset: Asset,
  file: string,
  args: Args,
  painted: PaintedSheet,
): Promise<RenderResult> {
  if (args.cmd === 'hero') return heroOne(asset, args, painted);
  if (args.cmd === 'icon') return iconOne(asset, args, painted);
  if (args.cmd === 'finish') return finishOne(asset, args, painted);
  if (args.cmd === 'critique') return critiqueOne(asset, file, args, painted);
  return reviewOne(asset, file, args, painted);
}

/** Paint the trim sheet once per run (~3 s at 2048²); the beauty renders sample it too. */
async function prepareSheet(args: Args, renders: boolean): Promise<PaintedSheet | undefined> {
  const wantsSheet = (args.cmd === 'build' && args.sheet !== 'none') || renders;
  if (wantsSheet) provideTextures(await loadTextureCache());
  provideImports(await loadImportCache());
  return wantsSheet ? paintTrimSheet({ ...DEFAULT_SHEET, size: args.sheetSize }) : undefined;
}

/** External mode writes the sheet once into <out>/; every GLB references ../trim_sheet_*.png. */
async function sheetBinding(
  args: Args,
  painted: PaintedSheet | undefined,
): Promise<SheetBinding | undefined> {
  if (args.cmd !== 'build' || args.sheet === 'none' || !painted) return undefined;
  if (args.sheet === 'embed') return painted;
  const pngs = sheetPngs(painted);
  await mkdir(args.out, { recursive: true });
  for (const map of SHEET_MAPS) await Bun.write(join(args.out, sheetFileName(map)), pngs[map]);
  return { external: true, prefix: '../trim_sheet' };
}

async function tuneAll(args: Args): Promise<number> {
  const runs: TuneRun[] = [];
  const failed: Failed[] = [];
  for (const file of args.files) {
    try {
      runs.push(await tuneFile(file, args));
    } catch (e) {
      failed.push({ file, error: recipeThrew(e, file, `tuning ${file}`).toJSON() });
    }
  }
  if (!args.json) failed.forEach(printFailed);
  return finish(args.json, failed, runs, printTune);
}
