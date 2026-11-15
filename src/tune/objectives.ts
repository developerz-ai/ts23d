// Score one trial: compile the recipe with trial values and turn each declared objective into a
// scalar to minimise (silhouette 1 − IoU, measures relative error, art shortfalls, triangles ÷
// budget, photo-reference distance, or the recipe's own function), then the weighted sum. Same
// values in, same numbers out.

import { type Asset, type CompiledAsset, compile, type Lod, Ts23dError } from '../core/index.ts';
import {
  ART_RENDER,
  compareFingerprints,
  fingerprint,
  measure,
  measureArt,
  type RefView,
  refFingerprint,
} from '../qa/index.ts';
import { cameraFor, photoView, renderBeauty } from '../render/index.ts';
import { silhouetteIoU } from './mask.ts';
import type { TunedValues, TuneObjective } from './types.ts';

export interface ObjectiveValue {
  readonly name: string;
  readonly weight: number;
  /** Raw value (lower is better). */
  readonly value: number;
}

export interface Score {
  readonly total: number;
  readonly objectives: readonly ObjectiveValue[];
}

/** Fitted reference masks by objective index (silhouette objectives only). */
export type FittedMasks = ReadonlyMap<number, Uint8Array>;

export const objectiveName = (o: TuneObjective): string =>
  o.kind === 'silhouette'
    ? `silhouette ${o.view}${o.lod ? ` LOD${o.lod}` : ''}`
    : o.kind === 'budget'
      ? `budget LOD${o.lod ?? 0}`
      : o.kind === 'custom'
        ? o.name
        : o.kind;

const tris = (a: CompiledAsset): number =>
  a.parts.reduce((s, p) => s + (p.mesh ? p.mesh.indices.length / 3 : 0), 0);

function measuresError(a: CompiledAsset): number {
  const ms = a.real?.measures ?? [];
  if (ms.length === 0)
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `'${a.name}' tunes against measures but declares no real.measures`,
      fix: 'add real.measures from the spec sheet, or drop the measures objective',
    });
  const errs = ms.map((m) => {
    const got = measure(a, m);
    return got === null ? 1 : Math.abs(got - m.value) / m.value;
  });
  return errs.reduce((s, e) => s + e, 0) / errs.length;
}

function artError(asset: Asset, lod0: CompiledAsset, lod2: CompiledAsset): number {
  const { metrics } = measureArt({
    lod0,
    lod2,
    beauty: renderBeauty(lod0, ART_RENDER),
    camera: cameraFor(lod0, ART_RENDER),
    ...(asset.art ? { art: asset.art } : {}),
  });
  const worst = Math.min(1, ...metrics.silhouette.map((s) => s.iou));
  const rest = Math.max(0, metrics.rest.min - metrics.rest.share);
  const focal = metrics.focal.declared.length ? 1 - metrics.focal.focalShare : 0;
  return 1 - worst + rest + focal;
}

/**
 * Distance of the asset from one committed reference view (`ref.json`), rendered from the view's
 * solved camera: (1 − silhouette IoU) + value EMD + spectrum gap, lower is better. Rendered 3:2 at
 * `height` px; the fingerprint crops and fits, so only the camera's direction and lens matter.
 * Until `kind: 'photo'` lands in TuneObjective, use it as
 * `{ kind: 'custom', name: 'photo side', score: (a) => photoError(a, ref.views.side) }`.
 */
export function photoError(asset: CompiledAsset, view: RefView | undefined, height = 256): number {
  if (!view?.camera)
    throw new Ts23dError('T3D_TUNE_INVALID', {
      cause: `'${asset.name}' photo objective: ${view ? 'the reference view has no solved camera' : 'no such reference view'}`,
      fix: 'solve the camera with photoMatch({ marks }) and re-run `bun run ref <recipe>` so ref.json carries it',
    });
  const width = Math.round(height * 1.5);
  const { rgba } = photoView(asset, view.camera, width, height);
  const d = compareFingerprints(fingerprint(rgba, width, height), refFingerprint(view));
  return 1 - d.iou + d.valueEmd + d.spectrumGap;
}

/** Compile `asset` with `values` and score every objective. */
export function scoreValues(
  asset: Asset,
  values: TunedValues,
  masks: FittedMasks,
  seed?: number,
): Score {
  const lods = new Map<Lod, CompiledAsset>();
  const at = (lod: Lod): CompiledAsset => {
    const hit = lods.get(lod);
    if (hit) return hit;
    const c = compile(asset, { lod, tuned: values, ...(seed !== undefined ? { seed } : {}) });
    lods.set(lod, c);
    return c;
  };
  const objectives = (asset.tune?.objectives ?? []).map((o, i): ObjectiveValue => {
    const weight = o.weight ?? 1;
    const name = objectiveName(o);
    if (o.kind === 'silhouette') {
      const ref = masks.get(i);
      if (!ref)
        throw new Ts23dError('T3D_TUNE_INVALID', {
          cause: `'${asset.name}' ${name}: no reference mask loaded`,
          fix: 'load masks with loadMasks(spec, recipeDir) before tuning',
        });
      return { name, weight, value: 1 - silhouetteIoU(at(o.lod ?? 0), o.view, ref) };
    }
    if (o.kind === 'measures') return { name, weight, value: measuresError(at(0)) };
    if (o.kind === 'art') return { name, weight, value: artError(asset, at(0), at(2)) };
    if (o.kind === 'budget') {
      const lod = o.lod ?? 0;
      const target = o.target ?? asset.budget.triangles[lod];
      return { name, weight, value: tris(at(lod)) / Math.max(1, target) };
    }
    const v = o.score(at(0));
    if (!Number.isFinite(v))
      throw new Ts23dError('T3D_TUNE_INVALID', {
        cause: `'${asset.name}' custom objective '${o.name}' returned ${v}`,
        fix: 'return a finite number, lower = better',
      });
    return { name, weight, value: v };
  });
  return { total: objectives.reduce((s, o) => s + o.weight * o.value, 0), objectives };
}
