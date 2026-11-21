// `t3d build` / `t3d shot` for one asset → <out>/<asset>/: the GLBs, hero / thumb / sheet PNGs,
// sound clips and manifest.json. QA covers exactly the LODs asked for: every gate per LOD (folded
// across LODs), the LOD-chain gates when more than one LOD is built, and `budget.draws` (draw calls
// exist only after export's per-pivot merge, so export counts them: `drawFindings`, which the
// testing module's `assertQaPass` runs too).

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Asset, CompiledAsset, Lod } from '../core/index.ts';
import { drawFindings, exportLodGlb, soundFiles, toGlb } from '../export/index.ts';
import { sheetFor } from '../material/index.ts';
import { codeOf, type Finding, runLodQa, runQa } from '../qa/index.ts';
import { beauty, contactSheet, previewSheet, thumbnail } from '../render/index.ts';
import type { Args } from './args.ts';
import { compileOnce } from './compile-cache.ts';
import { type AssetManifest, manifestOf } from './manifest.ts';
import { variantOf } from './render-cmds.ts';
import { foldLods } from './report.ts';
import type { RunSheets } from './run-sheets.ts';

/** Per-LOD gates folded across LODs, then the LOD-chain gates and the draw-call budget. */
export function qaOf(asset: Asset, lods: readonly CompiledAsset[]): Finding[] {
  return [
    ...foldLods(lods.map((a) => ({ lod: a.lod, findings: runQa(a) }))),
    ...runLodQa(lods),
    ...drawFindings(asset, lods),
  ];
}

export async function buildOne(
  asset: Asset,
  args: Args,
  sheets?: RunSheets,
): Promise<AssetManifest> {
  const dir = join(args.out, asset.name);
  await mkdir(dir, { recursive: true });
  const lods = args.lods.map((lod: Lod) => compileOnce(asset, { lod }));
  const findings = qaOf(asset, lods);
  // The asset's own sheet (its materials are known now); external mode writes its PNGs here.
  const texture = await sheets?.bind(dir, lods);
  const painted = sheets ? sheetFor(lods, sheets.recipe) : undefined;
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
  // Reuse a LOD this build compiled only when it is that LOD: `--lods 1,2` has no LOD0 (D559).
  const look = (lod: Lod): CompiledAsset =>
    variant
      ? compileOnce(asset, { lod, variant })
      : (lods.find((a) => a.lod === lod) ?? compileOnce(asset, { lod }));
  const png = (name: string): string => (variant ? `${name}_${variant}.png` : `${name}.png`);
  let hero: string | undefined;
  let thumb: string | undefined;
  let sheet: string | undefined;
  if (args.cmd === 'build' && args.shot) {
    const top = look(0);
    hero = await write(
      png('hero'),
      beauty(top, { ...args.render, ...(painted ? { sheet: painted } : {}) }),
    );
  }
  if (args.cmd === 'shot' || args.shot) {
    // Base colour as in the hero (D297): compile first, the preview sheet follows the materials.
    const [top, far] = [look(0), look(2)];
    const tones = previewSheet([top, far]);
    thumb = await write(png('thumb'), thumbnail(top, { sheet: tones }));
    sheet = await write(png('sheet'), contactSheet(top, { far, sheet: tones }));
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
    { animations: args.animations },
  );
  await write('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
