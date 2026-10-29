// Command dispatch for `t3d`. Pure function of argv → exit code, so it is testable in-process.
// Output layout, one folder per asset (stable paths agents and pipelines can rely on):
//   <out>/<asset>/lod0.glb lod1.glb lod2.glb thumb.png sheet.png manifest.json
//   <out>/index.json — every asset built in this run, with its QA verdict

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, compile, type Lod, Ts23dError } from '../core/index.ts';
import { SHEET_MAPS, type SheetBinding, sheetFileName, sheetPngs, toGlb } from '../export/index.ts';
import { DEFAULT_SHEET, paintTrimSheet } from '../material/index.ts';
import { type Finding, runQa } from '../qa/index.ts';
import { contactSheet, thumbnail } from '../render/index.ts';
import { type Args, HELP, parseArgs } from './args.ts';
import { loadAssets } from './load.ts';
import { type AssetManifest, manifestOf } from './manifest.ts';

async function buildOne(
  asset: Asset,
  args: Args,
  texture: SheetBinding | undefined,
): Promise<AssetManifest> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  // Only the LODs the user asked for: QA, GLBs and the manifest cover exactly those.
  const lods = args.lods.map((lod: Lod) => compile(asset, { lod }));
  const findings: Finding[] = lods.flatMap((a) =>
    runQa(a).map((f) => ({ ...f, message: `LOD${a.lod}: ${f.message}` })),
  );
  const glbs: string[] = [];
  if (args.cmd === 'build') {
    for (const a of lods) {
      const path = join(dir, `lod${a.lod}.glb`);
      await Bun.write(
        path,
        toGlb(a, { animations: args.animations, ...(texture ? { sheet: texture } : {}) }),
      );
      glbs.push(path);
    }
  }
  let sheet: string | undefined;
  let thumb: string | undefined;
  if (args.cmd === 'shot' || args.shot) {
    thumb = join(dir, 'thumb.png');
    await Bun.write(thumb, thumbnail(lods[0] ?? compile(asset)));
    sheet = join(dir, 'sheet.png');
    await Bun.write(
      sheet,
      contactSheet(lods[0] ?? compile(asset), { far: lods.at(-1) ?? compile(asset, { lod: 2 }) }),
    );
  }
  const manifest = manifestOf(
    asset,
    lods,
    { lods: glbs, ...(sheet ? { sheet } : {}), ...(thumb ? { thumb } : {}) },
    findings,
  );
  await Bun.write(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function print(m: AssetManifest): void {
  console.log(
    `${m.name}  QA ${m.qa.pass ? 'PASS' : 'FAIL'}  tris ${m.triangles.join('/')}  draws ${m.drawCalls.join('/')}`,
  );
  for (const f of [...m.files.lods, ...(m.files.sheet ? [m.files.sheet] : [])])
    console.log(`  → ${f}`);
  for (const f of m.qa.findings)
    console.log(`  ✗ ${f.gate}${f.part ? ` [${f.part}]` : ''}: ${f.message}\n    fix: ${f.fix}`);
}

export async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!['build', 'shot', 'list'].includes(args.cmd) || args.files.length === 0) {
    console.log(HELP);
    return args.cmd === 'help' ? 0 : 2;
  }
  const built: AssetManifest[] = [];
  // Paint the trim sheet once per run (~1 s at 1024²). External mode writes it once into <out>/
  // and every GLB in <out>/<asset>/ references ../trim_sheet_*.png — one texture set for all.
  let texture: SheetBinding | undefined;
  if (args.cmd === 'build' && args.sheet !== 'none') {
    const painted = paintTrimSheet({ ...DEFAULT_SHEET, size: args.sheetSize });
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
      for (const asset of await loadAssets(file)) {
        if (args.cmd === 'list')
          console.log(
            args.json ? JSON.stringify({ asset: asset.name, file }) : `${asset.name}  ${file}`,
          );
        else built.push(await buildOne(asset, args, texture));
      }
    }
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    console.error(
      args.json
        ? JSON.stringify({ ok: false, error: e.toJSON() })
        : `${e.message}\n  fix: ${e.fix}`,
    );
    return 1;
  }
  if (args.cmd === 'list') return 0;
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
