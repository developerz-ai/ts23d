// Measured art metrics (docs/idea/16-art-as-text.md): silhouette reads at 32 px, focal point, rest
// areas, grounded value, shape language — and the T3D_ART_* findings when they miss. Callers hand
// in the beauty render and its camera (render sits beside qa, so it renders, qa measures).

import type { AssetDefinition, CompiledAsset } from '../core/index.ts';
import {
  type FocalStats,
  focalStats,
  type GroundedStats,
  greyscale,
  groundedStats,
} from './critique-art.ts';
import { ART_VIEWS, iou, type Mask, solidMask } from './critique-mask.ts';
import { type PartBuffer, partBuffer, type ViewCamera } from './critique-raster.ts';
import { type RestStats, restStats } from './critique-rest.ts';
import { type ShapeStats, shapeLanguageOf } from './critique-shape.ts';
import type { Finding } from './types.ts';

export type ArtIntent = NonNullable<AssetDefinition['art']>;

/** Gate thresholds, calibrated on the committed gallery (16-art-as-text.md, "Calibration"). */
export const ART_THRESHOLDS = {
  silhouetteIoU: 0.85,
  silhouetteSize: 32,
  /** Focal: the peak lands on a focal part, or ≥ this share of the hottest pixels do. */
  focalShare: 0.3,
  restShare: 0.25,
  /** Std-dev of per-cell detail below this = uniform detail (all busy or all bare). */
  restSpread: 0.3,
  groundedRise: 0,
} as const;

/** Kinds where "grounded" (dark base, light top) is the convention. */
export const GROUNDED_KINDS: readonly string[] = ['character', 'creature'];

/** Metrics resolution: the same numbers in `t3d critique` and in `assertArt`. */
export const ART_RENDER = { width: 800, height: 450, supersample: 1 } as const;

export interface ArtMetrics {
  readonly silhouette: readonly { readonly view: string; readonly iou: number }[];
  readonly focal: Omit<FocalStats, 'hot'> & { readonly declared: readonly string[] };
  readonly rest: Omit<RestStats, 'detail' | 'cell' | 'cols' | 'rows'> & { readonly min: number };
  /** Absent when not applicable (kind is not a character/creature and `art.grounded` unset). */
  readonly grounded?: Omit<GroundedStats, 'bands'> & { readonly bands: readonly (number | null)[] };
  readonly shape: ShapeStats & { readonly declared?: string };
}

export interface ArtMaps {
  readonly near: readonly Mask[];
  readonly far: readonly Mask[];
  readonly lum: Float32Array;
  readonly buf: PartBuffer;
  readonly focal: FocalStats;
  readonly rest: RestStats;
}

export interface ArtInput {
  readonly lod0: CompiledAsset;
  readonly lod2: CompiledAsset;
  /** renderBeauty(lod0, ART_RENDER-sized options) and cameraFor(lod0, the same options). */
  readonly beauty: { readonly width: number; readonly height: number; readonly rgba: Uint8Array };
  readonly camera: ViewCamera;
  readonly art?: ArtIntent;
}

const listOf = (f: string | readonly string[] | undefined): readonly string[] =>
  f === undefined ? [] : typeof f === 'string' ? [f] : f;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

export function measureArt(i: ArtInput): { metrics: ArtMetrics; maps: ArtMaps } {
  const art = i.art ?? {};
  const size = ART_THRESHOLDS.silhouetteSize;
  const near = ART_VIEWS.map((v) => solidMask(i.lod0, v, size));
  const far = ART_VIEWS.map((v) => solidMask(i.lod2, v, size, i.lod0));
  const buf = partBuffer(i.lod0, i.camera);
  const lum = greyscale(i.beauty.rgba, buf);
  const declared = listOf(art.focal);
  const focal = focalStats(lum, buf, declared);
  const rest = restStats(buf);
  const applies = art.grounded ?? GROUNDED_KINDS.includes(i.lod0.kind);
  const g = applies ? groundedStats(lum, buf) : undefined;
  const shape = shapeLanguageOf(ART_VIEWS.map((v) => solidMask(i.lod0, v, 128)));
  const metrics: ArtMetrics = {
    silhouette: near.map((a, k) => ({
      view: ART_VIEWS[k]?.name ?? '',
      iou: r3(iou(a, far[k] ?? a)),
    })),
    focal: {
      peakPart: focal.peakPart,
      peak: focal.peak,
      focalShare: r3(focal.focalShare),
      focalArea: r3(focal.focalArea),
      top: focal.top.map((t) => ({ part: t.part, share: r3(t.share) })),
      declared,
    },
    rest: {
      share: r3(rest.share),
      spread: r3(rest.spread),
      min: art.restShare ?? ART_THRESHOLDS.restShare,
    },
    ...(g
      ? {
          grounded: {
            rise: r3(g.rise),
            bands: g.bands.map((b) => (Number.isFinite(b) ? r3(b) : null)),
          },
        }
      : {}),
    shape: {
      acuteShare: r3(shape.acuteShare),
      straightShare: r3(shape.straightShare),
      taper: r3(shape.taper),
      shape: shape.shape,
      ...(art.shape ? { declared: art.shape } : {}),
    },
  };
  return { metrics, maps: { near, far, lum, buf, focal, rest } };
}

export interface ArtFinding extends Finding {
  readonly code:
    | 'T3D_ART_SILHOUETTE'
    | 'T3D_ART_FOCAL'
    | 'T3D_ART_REST'
    | 'T3D_ART_GROUNDED'
    | 'T3D_ART_SHAPE';
  /** The measured value and the bound it missed. */
  readonly value: number | string;
  readonly limit: number | string;
}

/** Every metric that misses its threshold or the declared intent, as a finding with a fix. */
export function artFindings(name: string, m: ArtMetrics): ArtFinding[] {
  const out: ArtFinding[] = [];
  const T = ART_THRESHOLDS;
  for (const s of m.silhouette)
    if (s.iou < T.silhouetteIoU)
      out.push({
        code: 'T3D_ART_SILHOUETTE',
        gate: 'art-silhouette',
        value: s.iou,
        limit: T.silhouetteIoU,
        message: `${name}: LOD2 silhouette from ${s.view} matches LOD0 at IoU ${s.iou} < ${T.silhouetteIoU} (32 px thumbnail)`,
        fix: 'keep every big mass at LOD2 — gate segments and small parts on ctx.lod, never whole bodies, limbs or extents',
      });
  const f = m.focal;
  if (f.declared.length) {
    const ok = partHit(f.declared, f.peakPart) || f.focalShare >= T.focalShare;
    if (!ok)
      out.push({
        code: 'T3D_ART_FOCAL',
        gate: 'art-focal',
        part: f.peakPart,
        value: f.focalShare,
        limit: T.focalShare,
        message: `${name}: the strongest value contrast sits on '${f.peakPart}', not ${f.declared.join('/')} (focal share ${f.focalShare} < ${T.focalShare})`,
        fix: `raise value contrast on ${f.declared.join('/')} (darker recesses, lighter planes, sharper detail) and calm '${f.peakPart}' (one mid value, less detail)`,
      });
  }
  if (m.rest.share < m.rest.min)
    out.push({
      code: 'T3D_ART_REST',
      gate: 'art-rest',
      value: m.rest.share,
      limit: m.rest.min,
      message: `${name}: calm surface covers ${pct(m.rest.share)} of the visible asset < ${pct(m.rest.min)} — detail everywhere reads as noise`,
      fix: 'leave broad planes plain (no rivets, panels or noise) and cluster detail at joints, edges and the focal area',
    });
  if (m.rest.spread < T.restSpread)
    out.push({
      code: 'T3D_ART_REST',
      gate: 'art-rest',
      value: m.rest.spread,
      limit: T.restSpread,
      message: `${name}: detail is uniform across the surface (spread ${m.rest.spread} < ${T.restSpread})`,
      fix: 'vary detail density: dense clusters at the focal area and functional joints, calm planes between them',
    });
  if (m.grounded && m.grounded.rise < T.groundedRise)
    out.push({
      code: 'T3D_ART_GROUNDED',
      gate: 'art-grounded',
      value: m.grounded.rise,
      limit: T.groundedRise,
      message: `${name}: luminance falls from base to top (rise ${m.grounded.rise}) — the figure looks top-heavy`,
      fix: 'darken the lower body (boots, robe hem, legs: lower value, more grime) and keep the head and shoulders lighter',
    });
  if (m.shape.declared && m.shape.declared !== m.shape.shape)
    out.push({
      code: 'T3D_ART_SHAPE',
      gate: 'art-shape',
      value: m.shape.shape,
      limit: m.shape.declared,
      message: `${name}: silhouette reads ${m.shape.shape} (acute ${m.shape.acuteShare}, straight ${m.shape.straightShare}, taper ${m.shape.taper}), declared ${m.shape.declared}`,
      fix: SHAPE_FIX[m.shape.declared] ?? 'reshape the silhouette toward the declared language',
    });
  return out;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const partHit = (focal: readonly string[], part: string): boolean =>
  focal.some(
    (x) =>
      part === x ||
      part.startsWith(`${x}_`) ||
      (x.includes('*') && new RegExp(`^${x.replace(/\*/g, '.*')}$`).test(part)),
  );

const SHAPE_FIX: Readonly<Record<string, string>> = {
  aggressive: 'sharpen the outline: spikes, horns, swept points, acute wedges at the extremities',
  friendly: 'round the outline: bevel or fillet corners, swap wedges for circles and capsules',
  stable:
    'square the outline: long straight edges, right angles, a base at least as wide as the top',
};
