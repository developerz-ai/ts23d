// `t3d finish`: the AI finish layer for one asset → <out>/<asset>/finish/:
//   controls/<view>/{depth,normal,normal_world,part,uv,albedo[,beauty]}.png, legend.json,
//   cameras.json · model/<view>.png (the model's images) · finish_{albedo,orm,normal,base}.png
//   (atlas) · compare.png (before | after) · <asset>_finish.glb · finish.json (provenance, QA).
// Model results are cached in .ts23d/finish/ by content hash: a re-run replays offline.

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, compile, Ts23dError } from '../core/index.ts';
import {
  exportControlMaps,
  type FinishModel,
  fileStore,
  finishAsset,
  finishCompare,
  finishedGlb,
  finishPngs,
  httpFinish,
  mockFinish,
} from '../finish/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import type { Args } from './args.ts';
import type { RenderResult } from './render-cmds.ts';

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
  sheet: PaintedSheet,
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
  const r = await finishAsset(compile(asset, { lod: 0 }), {
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
    warnings: [
      ...r.findings.map((x) => ({
        code: x.code,
        message: `${x.part ?? x.view ?? ''}: ${x.message}`,
        fix: x.fix,
      })),
      ...r.qa.map((q) => ({
        code: `QA_${q.gate}`,
        message: `${q.part ?? ''} ${q.message}`.trim(),
        fix: q.fix,
      })),
    ],
  };
}
