// `t3d finish`: the AI finish layer for one asset → <out>/<asset>/finish/:
//   controls/<view>/{depth,normal,normal_world,part,uv,albedo[,beauty]}.png, legend.json,
//   cameras.json · model/<view>.png (the model's images) · finish_{albedo,orm,normal,base}.png
//   (atlas) · compare.png (before | after) · <asset>_finish.glb · finish.json (provenance, QA).
// Model results are cached in .ts23d/finish/ by content hash: a re-run replays offline.
// `t3d finish --hero` (heroFinishOne): the hero texture tier (ADR 012) → <out>/<asset>/hero/:
//   hero_{albedo,orm,normal,height}.png · <asset>_hero.glb (LOD0 on ts23d_hero) · hero.json.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, compile, Ts23dError } from '../core/index.ts';
import {
  exportControlMaps,
  type FinishModel,
  type FinishResult,
  fileStore,
  finishAsset,
  finishCompare,
  finishedGlb,
  finishPngs,
  heroGlb,
  heroPngs,
  heroTier,
  httpFinish,
  mockFinish,
} from '../finish/index.ts';
import type { ReviewWarning } from '../render/index.ts';
import type { Args } from './args.ts';
import type { RenderResult } from './render-cmds.ts';
import { type SheetSource, sheetOf } from './run-sheets.ts';

/** Default request for the mock (an http model needs the user's own prompt). */
export const MOCK_PROMPT = 'weathered, grime in the creases, light rust streaks, worn edges';

function modelOf(args: Args): FinishModel {
  const f = args.finish;
  if (f?.model !== 'http') return mockFinish();
  if (!f.endpoint)
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: '--model http without --endpoint',
      fix: 'pass --endpoint http://127.0.0.1:8188/ts23d-finish (your ComfyUI / diffusers wrapper), or --model mock',
    });
  return httpFinish({
    endpoint: f.endpoint,
    ...(f.timeoutMs !== undefined ? { timeoutMs: f.timeoutMs } : {}),
  });
}

export async function finishOne(
  asset: Asset,
  args: Args,
  look: SheetSource,
  store = fileStore(),
): Promise<RenderResult> {
  const f = args.finish ?? { model: 'mock' as const, force: false };
  if (f.model === 'http' && !f.prompt)
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: '--model http without --prompt',
      fix: 'describe the surface: --prompt "weathered oak crate, soot, rust on the iron bands"',
    });
  const dir = join(args.out, asset.name, 'finish');
  await mkdir(dir, { recursive: true });
  const model = modelOf(args);
  const lod0 = compile(asset, { lod: 0 });
  const sheet = sheetOf(look, lod0);
  const r = await finishAsset(lod0, {
    model,
    prompt: f.prompt ?? MOCK_PROMPT,
    ...(f.negative !== undefined ? { negative: f.negative } : {}),
    seed: args.seed ?? 1,
    ...(f.views !== undefined ? { views: f.views } : {}),
    ...(f.atlas !== undefined ? { atlas: f.atlas } : {}),
    sheet,
    // A real model is conditioned on the lit render too; the mock reads albedo + geometry only.
    beauty: f.model === 'http',
    store,
  });
  const files: [string, Uint8Array | string][] = [];
  for (const [path, bytes] of exportControlMaps(r.controls).files)
    files.push([join(dir, 'controls', path), bytes]);
  r.controls.views.forEach((v, i) => {
    files.push([join(dir, 'model', `${v.name}.png`), r.images[i] ?? new Uint8Array()]);
  });
  const pngs = finishPngs(r);
  for (const k of ['albedo', 'orm', 'normal', 'base'] as const)
    files.push([join(dir, `finish_${k}.png`), pngs[k]]);
  files.push([join(dir, 'compare.png'), finishCompare(r)]);
  const ok = r.findings.length === 0;
  if (ok || f.force) {
    const lower = [1, 2].map((lod) => compile(asset, { lod: lod as 1 | 2 }));
    files.push([
      join(dir, `${asset.name}_finish.glb`),
      finishedGlb(r, lower, { sheet, animations: args.animations, force: f.force }),
    ]);
  }
  const report = {
    asset: asset.name,
    accepted: ok,
    cache: r.cache,
    provenance: r.provenance,
    stats: r.stats,
    findings: r.findings,
    qa: r.qa,
  };
  files.push([join(dir, 'finish.json'), `${JSON.stringify(report, null, 2)}\n`]);
  for (const [path, bytes] of files) await Bun.write(path, bytes);
  const shown = files.map(([p]) => p).filter((p) => !p.includes(`${join(dir, 'controls')}/`));
  return {
    name: `${asset.name} (finish ${model.id}, cache ${r.cache}, seen ${(r.stats.seen * 100).toFixed(0)}%)`,
    files: shown,
    warnings: finishWarnings(r),
  };
}

/** Finish findings and the re-run QA as warnings; each keeps its own stable `T3D_*` code. */
export function finishWarnings(r: Pick<FinishResult, 'findings' | 'qa'>): ReviewWarning[] {
  return [
    ...r.findings.map((x) => ({
      code: x.code,
      message: `${x.part ?? x.view ?? ''}: ${x.message}`,
      fix: x.fix,
    })),
    ...r.qa.map((q) => ({
      code: q.code,
      message: `${q.part ?? ''} ${q.message}`.trim(),
      fix: q.fix,
    })),
  ];
}

/**
 * The hero bake of one asset: size and cell from `budget.heroTextures` (else `--atlas`, default
 * 2048, and 1.5 mm). Without the opt-in a sculpting kind meshes its usual LOD0 and tags no field,
 * so every texel is vertex colour only — the report says so.
 */
export async function heroFinishOne(
  asset: Asset,
  args: Args,
  look: SheetSource,
): Promise<RenderResult> {
  const declared = asset.budget.heroTextures;
  const atlas = declared?.size ?? args.finish?.atlas ?? 2048;
  if (atlas !== 1024 && atlas !== 2048 && atlas !== 4096)
    throw new Ts23dError('T3D_BAKE_INVALID', {
      cause: `hero atlas ${atlas} is not 1024, 2048 or 4096`,
      fix: 'declare budget.heroTextures: { size: 2048 } or pass --atlas 2048',
    });
  const dir = join(args.out, asset.name, 'hero');
  await mkdir(dir, { recursive: true });
  const lod0 = compile(asset, { lod: 0 });
  const sheet = sheetOf(look, lod0);
  const r = heroTier(lod0, {
    size: atlas,
    sheet,
    ...(declared?.cell !== undefined ? { cell: declared.cell } : {}),
  });
  const files: [string, Uint8Array | string][] = [];
  const pngs = heroPngs(r);
  for (const k of ['albedo', 'orm', 'normal', 'height'] as const)
    files.push([join(dir, `hero_${k}.png`), pngs[k]]);
  const force = args.finish?.force === true;
  if (r.findings.length === 0 || force) {
    const lower = [1, 2].map((lod) => compile(asset, { lod: lod as 1 | 2 }));
    const glb = heroGlb(r, lower, { sheet, animations: args.animations, force });
    files.push([join(dir, `${asset.name}_hero.glb`), glb]);
  }
  const baked = r.parts.filter((p) => p.hitRate !== null).map((p) => p.name);
  const report = {
    asset: asset.name,
    accepted: r.findings.length === 0,
    size: atlas,
    cell: r.cell,
    cage: r.cage,
    texelsPerMetre: Math.round(r.texelsPerMetre),
    heightRange: r.maps.heightRange,
    triangles: r.asset.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0),
    parts: r.parts,
    findings: r.findings,
  };
  files.push([join(dir, 'hero.json'), `${JSON.stringify(report, null, 2)}\n`]);
  for (const [path, bytes] of files) await Bun.write(path, bytes);
  return {
    name: `${asset.name} (hero ${atlas}², field parts: ${baked.join(', ') || 'none'})`,
    files: files.map(([p]) => p),
    warnings: [
      ...r.findings.map((x) => ({
        code: x.code,
        message: `${x.part ?? ''}: ${x.message}`,
        fix: x.fix,
      })),
      ...(baked.length === 0
        ? [
            {
              code: 'T3D_BAKE_FAILED',
              message: 'no part carries a field to bake: the maps are vertex colour only',
              fix: 'opt in with budget.heroTextures on a sculpted asset (defineCreature), or tag meshes with withBakeSource',
            },
          ]
        : []),
    ],
  };
}
