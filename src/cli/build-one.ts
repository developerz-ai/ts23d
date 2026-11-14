// `t3d build` / `t3d shot` for one asset → <out>/<asset>/: the GLBs, hero / thumb / sheet PNGs,
// sound clips and manifest.json. QA covers exactly the LODs asked for: every gate per LOD (folded
// across LODs), the LOD-chain gates when more than one LOD is built, and `budget.draws` (draw calls
// exist only after export's per-pivot merge, so they are counted here).

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type Asset, type CompiledAsset, compile, type Lod } from '../core/index.ts';
import { exportLodGlb, type SheetBinding, soundFiles, toGlb } from '../export/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { codeOf, type Finding, runLodQa, runQa } from '../qa/index.ts';
import { beauty, contactSheet, thumbnail } from '../render/index.ts';
import type { Args } from './args.ts';
import { type AssetManifest, drawCallsOf, manifestOf } from './manifest.ts';
import { variantOf } from './render-cmds.ts';
import { foldLods } from './report.ts';

/** `budget.draws` exceeded at a LOD → one finding. */
export function drawFindings(asset: Asset, lods: readonly CompiledAsset[]): Finding[] {
  const max = asset.budget.draws;
  if (max === undefined) return [];
  return lods.flatMap((l): Finding[] => {
    const n = drawCallsOf(l);
    return n > max
      ? [
          {
            gate: 'draw-calls',
            code: 'T3D_QA_DRAW_CALLS',
            message: `LOD${l.lod} needs ${n} draw calls, budget.draws is ${max}`,
            fix: 'give parts that move together one pivot (ctx.group) and share paint slots, so the export merges them; or raise budget.draws',
          },
        ]
      : [];
  });
}

/** Per-LOD gates folded across LODs, then the LOD-chain gates and the draw-call budget. */
export function qaOf(asset: Asset, lods: readonly CompiledAsset[]): Finding[] {
  return [
    ...foldLods(lods.map((a) => ({ lod: a.lod, findings: runQa(a) }))),
    ...(lods.length > 1 ? runLodQa(lods) : []),
    ...drawFindings(asset, lods),
  ];
}

export async function buildOne(
  asset: Asset,
  args: Args,
  texture: SheetBinding | undefined,
  painted: PaintedSheet | undefined,
): Promise<AssetManifest> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const lods = args.lods.map((lod: Lod) => compile(asset, { lod }));
  const findings = qaOf(asset, lods);
  // Manifest paths are relative to `dir`; `write` returns the relative name.
  const write = async (name: string, bytes: Uint8Array | string): Promise<string> => {
    await Bun.write(join(dir, name), bytes);
    return name;
  };
  const glbOptions = {
    animations: args.animations,
    ...(texture ? { sheet: texture } : {}),
    ...(args.physics ? { physics: true } : {}),
    ...(args.profile ? { profile: args.profile } : {}),
    ...(args.sounds ? {} : { sounds: false }),
  };
  // Clips the GLBs' KHR_audio_emitter entries reference, beside them (and for shot: to listen to).
  const sounds: string[] = [];
  for (const s of args.sounds && lods[0] ? soundFiles(lods[0]) : [])
    sounds.push(await write(s.file, s.bytes));
  const glbs: string[] = [];
  let single: string | undefined;
  let coverage: readonly number[] = [];
  if (args.cmd === 'build' && args.lodFiles !== 'single')
    for (const a of lods) glbs.push(await write(`lod${a.lod}.glb`, toGlb(a, glbOptions)));
  if (args.cmd === 'build' && args.lodFiles !== 'split') {
    const packed = exportLodGlb(lods, glbOptions);
    coverage = packed.coverage;
    single = await write(`${asset.name}.glb`, packed.glb);
    const phys = packed.physics;
    if (phys) {
      const [cx, cy, cz] = phys.mass.centerOfMass;
      console.log(
        `${asset.name}  physics ${phys.body}  mass ${(phys.mass.mass / 1000).toFixed(2)} t  centre of mass [${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}] m  colliders ${phys.colliders.length}`,
      );
      // The default `mass` gate may already report these; add only what it didn't.
      for (const f of phys.findings)
        if (!findings.some((g) => g.message.endsWith(f.message)))
          findings.push({
            gate: 'mass',
            code: codeOf('mass', f.message),
            message: `LOD0: ${f.message}`,
            fix: f.fix,
          });
    }
  }
  // Images show the chosen livery; the GLBs above carry every variant regardless.
  const variant = variantOf(asset, args);
  const look = (lod: Lod, compiled?: CompiledAsset): CompiledAsset =>
    variant ? compile(asset, { lod, variant }) : (compiled ?? compile(asset, { lod }));
  const png = (name: string): string => (variant ? `${name}_${variant}.png` : `${name}.png`);
  let hero: string | undefined;
  let thumb: string | undefined;
  let sheet: string | undefined;
  if (args.cmd === 'build' && args.shot) {
    const top = look(0, lods[0]);
    hero = await write(
      png('hero'),
      beauty(top, { ...args.render, ...(painted ? { sheet: painted } : {}) }),
    );
  }
  if (args.cmd === 'shot' || args.shot) {
    thumb = await write(png('thumb'), thumbnail(look(0, lods[0])));
    sheet = await write(
      png('sheet'),
      contactSheet(look(0, lods[0]), { far: look(2, lods.at(-1)) }),
    );
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
  await write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
