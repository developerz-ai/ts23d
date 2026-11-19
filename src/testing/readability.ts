// Readability assertions: the measurable art checks of docs/idea/16-art-as-text.md for users' recipe
// tests. Each renders LOD0 (beauty, 800×450) and LOD2, measures, and either returns the numbers or
// throws the T3D_ART_* finding with the measured value and a fix.
//   it('reads as art', () => assertArt(orcHead));

import { type Asset, compile, Ts23dError } from '../core/index.ts';
import {
  ART_RENDER,
  type ArtFinding,
  type ArtIntent,
  type ArtMaps,
  type ArtMetrics,
  artFindings,
  measureArt,
} from '../qa/index.ts';
import { type BeautyOptions, cameraFor, renderBeauty } from '../render/index.ts';

export interface ReadabilityOptions {
  /** Override (or supply) the asset's `art` intent for this check. */
  readonly art?: ArtIntent;
  readonly seed?: number;
  /** Beauty options (e.g. a painted `sheet`); size is fixed to ART_RENDER so numbers compare. */
  readonly render?: BeautyOptions;
}

const cache = new WeakMap<Asset, Map<string, { metrics: ArtMetrics; maps: ArtMaps }>>();
const ids = new WeakMap<object, number>();
let nextId = 0;

/** A cache key over every render option: numbers and `window` by value, the big objects (sheet,
 *  frameFrom) by identity, so a different sheet or camera is never served a stale measurement. */
function renderKey(r: BeautyOptions = {}): string {
  return JSON.stringify(
    Object.entries(r)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => {
        if (typeof v !== 'object' || v === null || k === 'window') return [k, v];
        const id = ids.get(v) ?? ++nextId;
        ids.set(v, id);
        return [k, `#${id}`];
      }),
  );
}

/** All five metrics for `asset` (cached per asset + options within a test run). */
export function artMetrics(
  asset: Asset,
  o: ReadabilityOptions = {},
): { metrics: ArtMetrics; maps: ArtMaps } {
  const key = JSON.stringify({
    art: o.art ?? null,
    seed: o.seed ?? null,
    render: renderKey(o.render),
  });
  const per = cache.get(asset) ?? new Map();
  cache.set(asset, per);
  const hit = per.get(key);
  if (hit) return hit;
  const seed = o.seed !== undefined ? { seed: o.seed } : {};
  const lod0 = compile(asset, { lod: 0, ...seed });
  const lod2 = compile(asset, { lod: 2, ...seed });
  const bo: BeautyOptions = { ...o.render, ...ART_RENDER };
  const art = o.art ?? asset.art;
  const out = measureArt({
    lod0,
    lod2,
    beauty: renderBeauty(lod0, bo),
    camera: cameraFor(lod0, bo),
    ...(art ? { art } : {}),
  });
  per.set(key, out);
  return out;
}

function fail(asset: Asset, found: readonly ArtFinding[]): void {
  const first = found[0];
  if (!first) return;
  throw new Ts23dError(first.code, {
    cause: `${asset.name} art: ${found.length} finding(s)\n${found
      .map((f) => `  - ${f.code} ${f.gate}: ${f.message} (measured ${f.value}, limit ${f.limit})`)
      .join('\n')}`,
    fix: first.fix,
  });
}

const only = (asset: Asset, o: ReadabilityOptions, code: ArtFinding['code']): ArtMetrics => {
  const { metrics } = artMetrics(asset, o);
  fail(
    asset,
    artFindings(asset.name, metrics).filter((f) => f.code === code),
  );
  return metrics;
};

/** LOD2 keeps LOD0's 32-px silhouette from front, side and 3/4 (IoU ≥ 0.85). Returns IoU per view. */
export const silhouetteReads = (
  asset: Asset,
  o: ReadabilityOptions = {},
): ArtMetrics['silhouette'] => only(asset, o, 'T3D_ART_SILHOUETTE').silhouette;

/** The highest local value contrast lands on `art.focal`. No-op (returns stats) when undeclared. */
export const focalPoint = (asset: Asset, o: ReadabilityOptions = {}): ArtMetrics['focal'] =>
  only(asset, o, 'T3D_ART_FOCAL').focal;

/** Calm surface ≥ `art.restShare` (default 25 %) and detail density is not uniform. */
export const restAreas = (asset: Asset, o: ReadabilityOptions = {}): ArtMetrics['rest'] =>
  only(asset, o, 'T3D_ART_REST').rest;

/** Luminance rises base → top (characters/creatures, or `art.grounded: true`); undefined = n/a. */
export const grounded = (asset: Asset, o: ReadabilityOptions = {}): ArtMetrics['grounded'] =>
  only(asset, o, 'T3D_ART_GROUNDED').grounded;

/** Silhouette shape class; must equal `art.shape` when declared. */
export const shapeLanguage = (asset: Asset, o: ReadabilityOptions = {}): ArtMetrics['shape'] =>
  only(asset, o, 'T3D_ART_SHAPE').shape;

/** Every applicable art check; throws the first T3D_ART_* code listing all findings. */
export function assertArt(asset: Asset, o: ReadabilityOptions = {}): ArtMetrics {
  const { metrics } = artMetrics(asset, o);
  fail(asset, artFindings(asset.name, metrics));
  return metrics;
}
