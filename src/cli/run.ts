// Command dispatch for `t3d`. Pure function of argv → exit code, so it is testable in-process.
// Output layout, one folder per asset (stable paths agents and pipelines can rely on):
//   <out>/<asset>/lod0.glb lod1.glb lod2.glb <asset>.glb (all LODs, MSFT_lod) hero.png thumb.png
//   sheet.png manifest.json · blueprint.png (t3d blueprint) · gaps/ (t3d gaps)
//   icon.png portrait.png rts.png (t3d icon: UI art, one fixed 3/4 high camera)
//   with --variant <v>: hero_<v>.png sheet_<v>.png thumb_<v>.png
//   <out>/<asset>/review/… (t3d review) · <out>/index.json — every asset built, with its QA verdict

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, type CompiledAsset, compile, type Lod, Ts23dError } from '../core/index.ts';
import {
  exportLodGlb,
  SHEET_MAPS,
  type SheetBinding,
  sheetFileName,
  sheetPngs,
  soundFiles,
  toGlb,
} from '../export/index.ts';
import {
  DEFAULT_SHEET,
  type PaintedSheet,
  paintTrimSheet,
  provideTextures,
} from '../material/index.ts';
import { provideImports } from '../neural/index.ts';
import { type Finding, runQa } from '../qa/index.ts';
import { beauty, contactSheet, thumbnail } from '../render/index.ts';
import { type Args, HELP, parseArgs } from './args.ts';
import { critiqueOne } from './critique-cmd.ts';
import { finishOne } from './finish-cmd.ts';
import { gapsOne } from './gaps-cmd.ts';
import { iconOne } from './icon-cmd.ts';
import { loadImportCache } from './import-cache.ts';
import { loadAssets } from './load.ts';
import { type AssetManifest, manifestOf } from './manifest.ts';
import {
  blueprintOne,
  heroOne,
  printRendered,
  type RenderResult,
  reviewOne,
  variantOf,
  wantVariant,
} from './render-cmds.ts';
import { loadTextureCache } from './texture-cache.ts';
import { printTune, type TuneRun, tuneFile } from './tune-cmd.ts';

async function buildOne(
  asset: Asset,
  args: Args,
  texture: SheetBinding | undefined,
  painted: PaintedSheet | undefined,
): Promise<AssetManifest> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  // Only the LODs the user asked for: QA, GLBs and the manifest cover exactly those.
  const lods = args.lods.map((lod: Lod) => compile(asset, { lod }));
  const findings: Finding[] = lods.flatMap((a) =>
    runQa(a).map((f) => ({ ...f, message: `LOD${a.lod}: ${f.message}` })),
  );
  const glbs: string[] = [];
  const glbOptions = {
    animations: args.animations,
    ...(texture ? { sheet: texture } : {}),
    ...(args.physics ? { physics: true } : {}),
    ...(args.profile ? { profile: args.profile } : {}),
    ...(args.sounds ? {} : { sounds: false }),
  };
  // Clips the GLBs' KHR_audio_emitter entries reference, beside them (and for shot: to listen to).
  const sounds: string[] = [];
  for (const s of args.sounds && lods[0] ? soundFiles(lods[0]) : []) {
    sounds.push(join(dir, s.file));
    await Bun.write(join(dir, s.file), s.bytes);
  }
  let single: string | undefined;
  let coverage: readonly number[] = [];
  if (args.cmd === 'build' && args.lodFiles !== 'single') {
    for (const a of lods) {
      const path = join(dir, `lod${a.lod}.glb`);
      await Bun.write(path, toGlb(a, glbOptions));
      glbs.push(path);
    }
  }
  if (args.cmd === 'build' && args.lodFiles !== 'split') {
    single = join(dir, `${asset.name}.glb`);
    const packed = exportLodGlb(lods, glbOptions);
    coverage = packed.coverage;
    await Bun.write(single, packed.glb);
    const phys = packed.physics;
    if (phys) {
      const [cx, cy, cz] = phys.mass.centerOfMass;
      if (!args.json)
        console.log(
          `${asset.name}  physics ${phys.body}  mass ${(phys.mass.mass / 1000).toFixed(2)} t  centre of mass [${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}] m  colliders ${phys.colliders.length}`,
        );
      // The default `mass` gate may already report these; add only what it didn't.
      for (const f of phys.findings)
        if (!findings.some((g) => g.message.endsWith(f.message)))
          findings.push({ gate: 'mass', message: `LOD0: ${f.message}`, fix: f.fix });
    }
  }
  let sheet: string | undefined;
  let thumb: string | undefined;
  let hero: string | undefined;
  // Images show the chosen livery; the GLBs above carry every variant regardless.
  const variant = variantOf(asset, args);
  const look = (lod: Lod, compiled?: CompiledAsset): CompiledAsset =>
    variant ? compile(asset, { lod, variant }) : (compiled ?? compile(asset, { lod }));
  const png = (name: string): string =>
    join(dir, variant ? `${name}_${variant}.png` : `${name}.png`);
  if (args.cmd === 'build' && args.shot) {
    hero = png('hero');
    const top = look(0, lods[0]);
    await Bun.write(hero, beauty(top, { ...args.render, ...(painted ? { sheet: painted } : {}) }));
  }
  if (args.cmd === 'shot' || args.shot) {
    thumb = png('thumb');
    await Bun.write(thumb, thumbnail(look(0, lods[0])));
    sheet = png('sheet');
    await Bun.write(sheet, contactSheet(look(0, lods[0]), { far: look(2, lods.at(-1)) }));
  }
  const manifest = manifestOf(
    asset,
    lods,
    {
      lods: glbs,
      ...(single ? { single } : {}),
      ...(hero ? { hero } : {}),
      ...(sheet ? { sheet } : {}),
      ...(thumb ? { thumb } : {}),
      ...(sounds.length ? { sounds } : {}),
    },
    findings,
    coverage,
  );
  await Bun.write(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function print(m: AssetManifest): void {
  console.log(
    `${m.name}  QA ${m.qa.pass ? 'PASS' : 'FAIL'}  tris ${m.triangles.join('/')}  draws ${m.drawCalls.join('/')}`,
  );
  for (const f of [
    ...m.files.lods,
    ...(m.files.single ? [m.files.single] : []),
    ...(m.files.hero ? [m.files.hero] : []),
    ...(m.files.sheet ? [m.files.sheet] : []),
  ])
    console.log(`  → ${f}`);
  for (const f of m.qa.findings)
    console.log(`  ✗ ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}\n    fix: ${f.fix}`);
}

const COMMANDS = [
  'build',
  'shot',
  'list',
  'hero',
  'review',
  'critique',
  'blueprint',
  'gaps',
  'icon',
  'tune',
  'finish',
];

function fail(e: unknown, json: boolean): number {
  if (!(e instanceof Ts23dError)) throw e;
  console.error(
    json ? JSON.stringify({ ok: false, error: e.toJSON() }) : `${e.message}\n  fix: ${e.fix}`,
  );
  return 1;
}

export async function run(argv: readonly string[]): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    return fail(e, argv.includes('--json'));
  }
  if (!COMMANDS.includes(args.cmd) || args.files.length === 0) {
    console.log(HELP);
    return args.cmd === 'help' ? 0 : 2;
  }
  if (args.cmd === 'tune') return tuneAll(args);
  const built: AssetManifest[] = [];
  const rendered: RenderResult[] = [];
  // Paint the trim sheet once per run (~4 s at 2048²). External mode writes it once into <out>/
  // and every GLB in <out>/<asset>/ references ../trim_sheet_*.png — one texture set for all.
  // The beauty renders sample the same painted sheet.
  const renders =
    args.cmd === 'hero' ||
    args.cmd === 'review' ||
    args.cmd === 'critique' ||
    args.cmd === 'icon' ||
    args.cmd === 'finish';
  // Blueprint and gaps draw without the painted trim sheet.
  const drawn = renders || args.cmd === 'blueprint' || args.cmd === 'gaps';
  const wantsSheet = (args.cmd === 'build' && args.sheet !== 'none') || renders;
  if (wantsSheet) provideTextures(await loadTextureCache());
  provideImports(await loadImportCache());
  const painted = wantsSheet
    ? paintTrimSheet({ ...DEFAULT_SHEET, size: args.sheetSize })
    : undefined;
  let texture: SheetBinding | undefined;
  if (args.cmd === 'build' && args.sheet !== 'none' && painted) {
    if (args.sheet === 'embed') texture = painted;
    else {
      const pngs = sheetPngs(painted);
      await mkdir(args.out, { recursive: true });
      for (const map of SHEET_MAPS) await Bun.write(join(args.out, sheetFileName(map)), pngs[map]);
      texture = { external: true, prefix: '../trim_sheet' };
    }
  }
  try {
    for (const file of args.files) {
      const assets = await loadAssets(file);
      wantVariant(assets, args, file);
      for (const asset of assets) {
        if (args.cmd === 'list')
          console.log(
            args.json ? JSON.stringify({ asset: asset.name, file }) : `${asset.name}  ${file}`,
          );
        else if (args.cmd === 'blueprint') rendered.push(await blueprintOne(asset, args));
        else if (args.cmd === 'gaps') rendered.push(await gapsOne(asset, args));
        else if (renders && painted)
          rendered.push(
            args.cmd === 'hero'
              ? await heroOne(asset, args, painted)
              : args.cmd === 'icon'
                ? await iconOne(asset, args, painted)
                : args.cmd === 'finish'
                  ? await finishOne(asset, args, painted)
                  : args.cmd === 'critique'
                    ? await critiqueOne(asset, file, args, painted)
                    : await reviewOne(asset, file, args, painted),
          );
        else built.push(await buildOne(asset, args, texture, painted));
      }
    }
  } catch (e) {
    return fail(e, args.json);
  }
  if (args.cmd === 'list') return 0;
  if (drawn) {
    // An undeclared slit is a QA failure: `t3d gaps` exits 1 like `t3d build`.
    // Rejected finishes (T3D_FINISH_*) and QA findings on the finished asset exit 1 too.
    const ok =
      (args.cmd !== 'gaps' && args.cmd !== 'finish') ||
      rendered.every((r) => r.warnings.length === 0);
    if (args.json) console.log(JSON.stringify({ ok, data: rendered }));
    else rendered.forEach(printRendered);
    return ok ? 0 : 1;
  }
  const ok = built.every((m) => m.qa.pass);
  const index = built.map((m) => ({
    name: m.name,
    qa: m.qa.pass ? 'PASS' : 'FAIL',
    triangles: m.triangles,
    manifest: join(m.name, 'manifest.json'),
  }));
  await Bun.write(
    join(args.out, 'index.json'),
    `${JSON.stringify({ ok, assets: index }, null, 2)}\n`,
  );
  if (args.json) console.log(JSON.stringify({ ok, data: built }));
  else built.forEach(print);
  return ok ? 0 : 1;
}

async function tuneAll(args: Args): Promise<number> {
  const runs: TuneRun[] = [];
  try {
    for (const file of args.files) runs.push(await tuneFile(file, args));
  } catch (e) {
    return fail(e, args.json);
  }
  if (args.json) console.log(JSON.stringify({ ok: true, data: runs }));
  else runs.forEach(printTune);
  return 0;
}
