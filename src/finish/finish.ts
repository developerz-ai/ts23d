// finishAsset: the AI finish layer end to end. Code built the asset (dimensions, parts, pivots,
// motion, LODs, physics, QA); the finish only adds surface detail on top:
//   atlas (unique UVs) → control views → model (through the cache) → part-masked projection bake →
//   fill → derived maps → finish QA + the asset's own QA re-run.
// The result's `asset` is the LOD0 asset with finishable parts on atlas UVs and white vertex colour
// (the finish albedo carries the colour); triangles, positions, normals, names, pivots, motion,
// joints, physics and sounds are the input's. LOD1/2 are untouched: they keep the trim sheet.

import type { CompiledAsset, Part } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import type { PaintedSheet } from '../material/index.ts';
import { type Finding, runQa } from '../qa/index.ts';
import { type BakeOptions, decodeViews, project } from './bake.ts';
import { runCached } from './cache.ts';
import { controlViews } from './control.ts';
import { fillAtlas, paddedBase } from './fill.ts';
import { deriveMaps } from './maps.ts';
import { checkFinish, type FinishQaOptions, paletteDrift } from './qa.ts';
import { finishScene } from './scene.ts';
import { atlasTexels } from './texels.ts';
import type {
  ControlViews,
  FinishFinding,
  FinishModel,
  FinishProvenance,
  FinishStore,
} from './types.ts';

export interface FinishOptions extends FinishQaOptions, BakeOptions {
  readonly model: FinishModel;
  readonly prompt: string;
  readonly negative?: string;
  readonly seed?: number;
  readonly palette?: readonly string[];
  /** Views (N−1 orbit + top), default 8; view size px, default 512; atlas size, default 1024. */
  readonly views?: number;
  readonly size?: number;
  readonly atlas?: number;
  /** The painted trim sheet: base colour = vertex colour × its albedo (default: vertex colour). */
  readonly sheet?: PaintedSheet;
  /** Render the lit beauty per view for the model (slower; the mock does not need it). */
  readonly beauty?: boolean;
  /** Model result cache; omitted = always run the model. */
  readonly store?: FinishStore;
}

export interface FinishMaps {
  readonly size: number;
  /** RGBA8: finished albedo (sRGB), base (before), ORM and detail normal (linear). */
  readonly albedo: Uint8Array;
  readonly base: Uint8Array;
  readonly orm: Uint8Array;
  readonly normal: Uint8Array;
}

export interface FinishResult {
  readonly asset: CompiledAsset;
  readonly controls: ControlViews;
  /** The model's PNGs, one per view (replayable). */
  readonly images: readonly Uint8Array[];
  readonly maps: FinishMaps;
  readonly provenance: FinishProvenance;
  readonly cache: 'hit' | 'miss' | 'off';
  /** Finish QA (`T3D_FINISH_*`); empty = accepted. */
  readonly findings: readonly FinishFinding[];
  /** The asset's own QA gates, re-run on the finished asset. */
  readonly qa: readonly Finding[];
  readonly stats: {
    readonly seen: number;
    readonly leak: number;
    readonly charts: number;
    readonly texelsPerMetre: number;
    readonly drift: Readonly<Record<string, number>>;
  };
}

export const FINISH_NOTE =
  'albedo projected from model images (part-masked, n·v weighted); roughness, metal and the detail normal are heuristics from the albedo, not measured';

/** The finished LOD0: finishable parts take their atlas mesh with white vertex colour. */
function finishedAsset(
  lod0: CompiledAsset,
  atlas: ReturnType<typeof finishScene>['atlas'],
): CompiledAsset {
  const parts = lod0.parts.map((p): Part => {
    const a = atlas.parts.get(p.name);
    return a
      ? { ...p, mesh: { ...a.mesh, colors: new Float32Array(a.mesh.colors.length).fill(1) } }
      : p;
  });
  return { ...lod0, parts };
}

export async function finishAsset(lod0: CompiledAsset, o: FinishOptions): Promise<FinishResult> {
  if (lod0.lod !== 0 || lod0.variant !== undefined)
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: `finish got '${lod0.name}' at LOD${lod0.lod}${lod0.variant ? ` as variant '${lod0.variant}'` : ''}`,
      fix: 'finish compile(asset, { lod: 0 }) — the finish is the hero layer; LOD1/2 keep the trim sheet',
    });
  if (o.prompt.trim() === '')
    throw new Ts23dError('T3D_FINISH_INVALID', {
      cause: 'empty prompt',
      fix: 'describe the surface: --prompt "weathered oak crate, soot, rust on the iron bands"',
    });
  const seed = o.seed ?? 1;
  const scene = finishScene(lod0, o.atlas ?? 1024, o.sheet);
  const controls = controlViews(scene, {
    ...(o.views !== undefined ? { views: o.views } : {}),
    ...(o.size !== undefined ? { size: o.size } : {}),
    beauty: o.beauty === true,
  });
  const request = {
    views: controls,
    prompt: o.prompt,
    seed,
    ...(o.negative !== undefined ? { negative: o.negative } : {}),
    ...(o.palette ? { palette: o.palette } : {}),
  };
  const { images, key, cache } = await runCached(o.model, request, o.store);
  const rgba = decodeViews(controls, images);
  const texels = atlasTexels(scene);
  const pr = project(texels, controls, rgba, o);
  const filled = fillAtlas(texels, pr, controls.parts.length);
  const derived = deriveMaps(texels, filled.albedo);
  const findings = checkFinish(controls, texels, filled.albedo, pr, rgba, o);
  const asset = finishedAsset(lod0, scene.atlas);
  const { drift } = paletteDrift(texels, filled.albedo, controls.parts.length);
  return {
    asset,
    controls,
    images,
    maps: { size: texels.size, albedo: filled.albedo, base: paddedBase(texels), ...derived },
    provenance: {
      model: o.model.id,
      prompt: o.prompt,
      ...(o.negative !== undefined ? { negative: o.negative } : {}),
      seed,
      key,
      views: controls.views.map((v) => v.name),
      atlas: texels.size,
      licence: o.model.licence ?? 'not declared by the model adapter',
      note: FINISH_NOTE,
    },
    cache,
    findings,
    qa: runQa(asset),
    stats: {
      seen: filled.seen,
      leak: pr.leak,
      charts: scene.atlas.charts,
      texelsPerMetre: scene.atlas.texelsPerMetre,
      drift: Object.fromEntries(
        controls.parts.flatMap((p, i) =>
          controls.finishable[i] ? [[p, Math.round((drift[i] ?? 0) * 10) / 10]] : [],
        ),
      ),
    },
  };
}

/** Throw the first finish finding (code + fix) — for pipelines that must not ship a bad finish. */
export function assertFinish(r: FinishResult): void {
  const f = r.findings[0];
  if (f)
    throw new Ts23dError(f.code, {
      cause: `${f.part ?? f.view ?? r.asset.name}: ${f.message}${r.findings.length > 1 ? ` (+${r.findings.length - 1} more)` : ''}`,
      fix: f.fix,
    });
}
