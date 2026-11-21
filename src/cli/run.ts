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

import { join } from 'node:path';
import { type Asset, isTs23dError, Ts23dError } from '../core/index.ts';
import { provideTextures, type SheetRecipe } from '../material/index.ts';
import { provideImports } from '../neural/index.ts';
import { type Args, parseArgs } from './args.ts';
import { blenderMain } from './blender-review-cmd.ts';
import { buildOne } from './build-one.ts';
import { conceptCli } from './concept-cli.ts';
import { critiqueOne } from './critique-cmd.ts';
import { doctorMain } from './doctor-cmd.ts';
import { finishOne, heroFinishOne } from './finish-cmd.ts';
import { gapsOne } from './gaps-cmd.ts';
import { helpText, versionOf } from './help.ts';
import { iconOne } from './icon-cmd.ts';
import { loadImportCache } from './import-cache.ts';
import { writeIndex } from './index-json.ts';
import { initMain } from './init-cmd.ts';
import { loadAssets, recipeThrew } from './load.ts';
import type { AssetManifest } from './manifest.ts';
import { mcpMain } from './mcp/server.ts';
import { neuralMain } from './neural-cmd.ts';
import { provideRecipeNeural } from './neural-store.ts';
import { planMain } from './plan-cmd.ts';
import { queued, queueMain } from './queue/index.ts';
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
  finish,
  jsonStdout,
  printError,
  printFailed,
  printManifest,
  qaFailed,
} from './report.ts';
import { type RunSheets, runSheets } from './run-sheets.ts';
import { serverMain } from './server-cmd.ts';
import { setupMain } from './setup-cmd.ts';
import { loadTextureCache } from './texture-cache.ts';
import { printTune, type TuneRun, tuneFile } from './tune-cmd.ts';
import { emptyRecipeDirs, entriesOf, watchMain } from './watch.ts';

const RENDERS = ['hero', 'review', 'critique', 'icon', 'finish'];

/** A throw outside any recipe (texture cache, disk) still leaves with a code and a fix. */
function outside(e: unknown): Ts23dError {
  if (isTs23dError(e)) return e;
  return new Ts23dError('T3D_RECIPE_THREW', {
    cause: `t3d failed outside a recipe: ${e instanceof Error ? e.message : String(e)}`,
    fix: 'check the files t3d reads and writes (.ts23d/, --out); if it persists, open an issue with the command line',
  });
}

/** t3d's own part of the line: after a `--` come the words of the command `t3d queue` starts. */
const own = (argv: readonly string[]): readonly string[] =>
  argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv;

export async function run(argv: readonly string[]): Promise<number> {
  const json = own(argv).includes('--json');
  // Under --json stdout carries only the envelope: human lines (and recipes' logs) go to stderr.
  const restore = json ? jsonStdout() : () => {};
  try {
    return await queued(argv, (rest) => dispatch(rest, json));
  } catch (e) {
    return printError(outside(e), json);
  } finally {
    restore();
  }
}

async function dispatch(argv: readonly string[], json: boolean): Promise<number> {
  if (argv[0] === 'mcp') return mcpMain(argv.slice(1));
  const help = own(argv).includes('--help');
  if (argv[0] === 'init' && !help) return initMain(argv.slice(1), json);
  if (argv[0] === 'concept' && !help) return conceptCli(argv.slice(1), json);
  if (argv[0] === 'doctor' && !help) return doctorMain(argv.slice(1), json);
  if (argv[0] === 'setup' && !help) return setupMain(argv.slice(1), json);
  if (argv[0] === 'server' && !help) return serverMain(argv.slice(1), json);
  if (argv[0] === 'plan' && !help) return planMain(argv.slice(1), json);
  if (argv[0] === 'blender' && !help) return blenderMain(argv.slice(1), json);
  if (argv[0] === 'queue' && !help) return queueMain(argv.slice(1), json);
  if (argv[0] === 'build' && argv.includes('--watch')) return watchMain(argv);
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    if (!isTs23dError(e)) throw e;
    if (
      !json &&
      e.code === 'T3D_CLI_USAGE' &&
      (e.message.includes('unknown command') || e.message.includes('no command given'))
    )
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
  if (args.cmd === 'neural')
    return neuralMain(args.files, {
      json,
      requireNeural: args.requireNeural,
      allowBadInput: args.allowBadInput,
      yesSpend: args.yesSpend,
    });
  const renders = RENDERS.includes(args.cmd);
  // Each asset is painted its own sheet after it compiles (its materials are known then: D299).
  const sheets = await prepareSheet(args, renders);
  const built: AssetManifest[] = [];
  const rendered: RenderResult[] = [];
  const listed: { asset: string; file: string }[] = [];
  const failed: Failed[] = [];
  const seen = new Map<string, string>();
  for (const { dir, error } of emptyRecipeDirs(args.files))
    failed.push({ file: dir, error: error.toJSON() });
  for (const file of entriesOf(args.files)) {
    let assets: Asset[];
    try {
      assets = await loadAssets(file);
      wantVariant(assets, args, file);
    } catch (e) {
      failed.push({ file, error: recipeThrew(e, file, `loading ${file}`).toJSON() });
      continue;
    }
    // The recipe's committed neural cache (ADR 014): offline; a miss is a CPU-tier fallback.
    const neural = await provideRecipeNeural(
      file,
      assets.map((a) => a.name),
      args.requireNeural,
    );
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
        else if (renders && sheets)
          rendered.push(await renderOne(asset, file, args, sheets.recipe));
        else built.push(await buildOne(asset, args, sheets));
      } catch (e) {
        const error = recipeThrew(e, file, `${asset.name}'s build()`).toJSON();
        failed.push({ file, asset: asset.name, error });
      }
    }
    if (!json)
      for (const n of neural.notices()) console.error(`${n.code}: ${n.message}\n  fix: ${n.fix}`);
  }
  if (!json) failed.forEach(printFailed);
  if (args.cmd === 'list')
    return finish(json, failed, listed, (l) => console.log(`${l.asset}  ${l.file}`));
  if (renders || args.cmd === 'blueprint' || args.cmd === 'gaps') {
    // An undeclared slit is a QA failure: `t3d gaps` exits 1 like `t3d build`.
    // Rejected finishes (T3D_FINISH_*) and QA findings on the finished asset exit 1 too.
    const warned = rendered.filter((r) => r.warnings.length > 0);
    const clean = (args.cmd !== 'gaps' && args.cmd !== 'finish') || warned.length === 0;
    const count = warned.reduce((n, r) => n + r.warnings.length, 0);
    const why = qaFailed(
      count,
      warned.map((r) => r.name),
      'data[].warnings',
    );
    return finish(json, failed, rendered, printRendered, clean ? undefined : why);
  }
  if (built.length) await writeIndex(args.out, built);
  // `files` stay relative (manifest.json's own form); `dir` is the folder they are in.
  const placed = built.map((m) => ({ ...m, dir: join(args.out, m.name) }));
  const red = built.filter((m) => !m.qa.pass);
  const count = red.reduce((n, m) => n + m.qa.findings.length, 0);
  const why = qaFailed(
    count,
    red.map((m) => m.name),
    'data[].qa.findings',
  );
  return finish(json, failed, placed, (m) => printManifest(m, m.dir), red.length ? why : undefined);
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
  look: SheetRecipe,
): Promise<RenderResult> {
  if (args.cmd === 'hero') return heroOne(asset, args, look);
  if (args.cmd === 'icon') return iconOne(asset, args, look);
  if (args.cmd === 'finish')
    return args.finish?.hero ? heroFinishOne(asset, args, look) : finishOne(asset, args, look);
  if (args.cmd === 'critique') return critiqueOne(asset, file, args, look);
  return reviewOne(asset, file, args, look);
}

/** Load the caches a paint reads; the run's sheets when the command writes or renders one. */
async function prepareSheet(args: Args, renders: boolean): Promise<RunSheets | undefined> {
  const wantsSheet = (args.cmd === 'build' && args.sheet !== 'none') || renders;
  // `shot` paints no full sheet, but its sheet.png reads the 512² preview sheet (D297).
  if (wantsSheet || args.cmd === 'shot') provideTextures(await loadTextureCache());
  provideImports(await loadImportCache());
  return wantsSheet ? runSheets(args) : undefined;
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
