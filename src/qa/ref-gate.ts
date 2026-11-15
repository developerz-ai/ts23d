// Reference-match checks: the asset against the committed derived data of its reference photos
// (`recipes/<name>/ref.json`; the photos themselves are never committed). Silhouette IoU per view
// runs on solid orthographic masks here; value and detail need a render, so the caller passes model
// fingerprints to `refFindings`. Codes: T3D_REF_SILHOUETTE / _VALUE / _DETAIL (docs/idea/06-qa.md).

import { type CompiledAsset, encodePng, Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { type ArtView, solidMask } from './critique-mask.ts';
import { compareFingerprints, type Fingerprint, FP_SIZE, fingerprint } from './ref-fingerprint.ts';
import type { Finding, Gate } from './types.ts';

export type RefViewName = 'side' | 'front' | 'top' | 'threeQuarter';
export const REF_VIEWS: readonly RefViewName[] = ['side', 'front', 'top', 'threeQuarter'];

/** Structurally the render module's PhotoCamera (asset space, metres, Z up). */
export interface RefCamera {
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDeg: number;
}

export interface RefSource {
  /** The Commons file page (or other page) the photo comes from. */
  readonly url: string;
  /** sha256 of the exact bytes fingerprinted. */
  readonly sha256: string;
  readonly licence: string;
  readonly artist?: string;
}

export interface RefView {
  /** base64 PNG, 128², opaque black = object. */
  readonly mask: string;
  readonly lab: readonly number[];
  readonly spectrum: readonly number[];
  readonly edges: readonly number[];
  /** Solved camera (`t3d` photo match) or null when not solved yet. */
  readonly camera: RefCamera | null;
  readonly source: RefSource;
}

export interface RefFile {
  readonly views: Partial<Record<RefViewName, RefView>>;
}

/** Recipe opt-in targets (`real.ref`); the defaults are the flagship bar. */
export interface RefLimits {
  readonly minIou: number;
  readonly maxValueEmd: number;
  readonly maxSpectrumGap: number;
}
export const REF_LIMITS: RefLimits = { minIou: 0.88, maxValueEmd: 0.12, maxSpectrumGap: 0.15 };

/** Orthographic stand-ins for the photo views (camera.ts azimuth convention). */
const ORTHO: Readonly<Record<RefViewName, ArtView>> = {
  side: { name: 'side', azDeg: -90, elDeg: 0 },
  front: { name: 'front', azDeg: 0, elDeg: 0 },
  top: { name: 'top', azDeg: 0, elDeg: 89.9 },
  threeQuarter: { name: '3/4', azDeg: -35, elDeg: 18 },
};
/** Views a photographer may shoot facing either way: compare mirrored too. */
const MIRROR: ReadonlySet<RefViewName> = new Set(['side', 'threeQuarter']);

const bad = (cause: string): never => {
  throw new Ts23dError('T3D_RECIPE_INVALID', {
    cause: `ref.json: ${cause}`,
    fix: 're-generate it with `bun run ref <recipe>`; never hand-edit the derived numbers',
  });
};

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** A 128² mask as base64 PNG (object = opaque black, background = transparent white). */
export function encodeRefMask(mask: Uint8Array): string {
  const rgba = new Uint8Array(mask.length * 4);
  for (let i = 0; i < mask.length; i++)
    rgba.set(mask[i] ? [0, 0, 0, 255] : [255, 255, 255, 0], i * 4);
  return base64(encodePng(FP_SIZE, FP_SIZE, rgba));
}

/** PNG bytes → mask (alpha ≥ 128 and not near-white = object), with its size. */
export function maskOfRefPng(png: Uint8Array): { mask: Uint8Array; width: number; height: number } {
  const img = decodePng(png, (cause) => bad(`mask PNG: ${cause}`));
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < mask.length; i++) {
    const lum =
      ((img.data[i * 4] ?? 0) + (img.data[i * 4 + 1] ?? 0) + (img.data[i * 4 + 2] ?? 0)) / 3;
    mask[i] = (img.data[i * 4 + 3] ?? 0) >= 128 && lum < 200 ? 1 : 0;
  }
  return { mask, width: img.width, height: img.height };
}

/** Validate parsed ref.json at the boundary. */
export function checkRefFile(json: unknown): RefFile {
  const views = (json as { views?: unknown } | null)?.views;
  if (typeof views !== 'object' || views === null) return bad('no `views` object');
  for (const [name, v] of Object.entries(views as Record<string, unknown>)) {
    if (!REF_VIEWS.includes(name as RefViewName))
      bad(`unknown view '${name}' (${REF_VIEWS.join(', ')})`);
    const r = v as Partial<RefView>;
    const nums = (k: 'lab' | 'spectrum' | 'edges', n: number): void => {
      const a = r[k];
      if (!Array.isArray(a) || a.length !== n || !a.every(Number.isFinite))
        bad(`${name}.${k} must be ${n} numbers`);
    };
    if (typeof r.mask !== 'string') bad(`${name}.mask must be a base64 PNG`);
    nums('lab', 48);
    nums('spectrum', 8);
    nums('edges', 64);
    if (!r.source?.url || !r.source.sha256 || !r.source.licence)
      bad(`${name}.source needs url, sha256, licence`);
  }
  return json as RefFile;
}

/** The committed view as a fingerprint (mask decoded from its PNG). */
export function refFingerprint(v: RefView): Fingerprint {
  const { mask, width, height } = maskOfRefPng(
    Uint8Array.from(atob(v.mask), (c) => c.charCodeAt(0)),
  );
  if (width !== FP_SIZE || height !== FP_SIZE) bad(`mask is ${width}×${height}, want ${FP_SIZE}²`);
  return { mask128: mask, lab: [...v.lab], spectrum: [...v.spectrum], edges: [...v.edges] };
}

/** The asset's solid outline from a reference view, fingerprinted (mask only). */
export function modelOutline(asset: CompiledAsset, view: RefViewName, size = 256): Fingerprint {
  const m = solidMask(asset, ORTHO[view], size);
  return fingerprint(
    Uint8Array.from(m.data, (c) => (c >= 0.5 ? 1 : 0)),
    size,
    size,
  );
}

/** IoU of the asset's outline from `view` against a reference mask PNG (both cropped + fitted). */
export function silhouetteIoU(
  asset: CompiledAsset,
  referencePng: Uint8Array,
  view: RefViewName = 'side',
): number {
  const { mask, width, height } = maskOfRefPng(referencePng);
  const ref = fingerprint(mask, width, height);
  return compareFingerprints(modelOutline(asset, view), ref, { mirror: MIRROR.has(view) }).iou;
}

const finding = (
  code: string,
  view: string,
  metric: string,
  got: string,
  want: string,
  fix: string,
): Finding => ({
  gate: 'reference',
  code,
  message: `${code} ${view} view: ${metric} ${got}, target ${want}`,
  fix,
});

/** Findings for model fingerprints (rendered from the solved cameras) vs the reference views. */
export function refFindings(
  model: Partial<Record<RefViewName, Fingerprint>>,
  ref: RefFile,
  limits: RefLimits = REF_LIMITS,
): Finding[] {
  const out: Finding[] = [];
  for (const name of REF_VIEWS) {
    const v = ref.views[name];
    const m = model[name];
    if (!v || !m) continue;
    const d = compareFingerprints(m, refFingerprint(v), { mirror: MIRROR.has(name) });
    if (!(d.iou >= limits.minIou))
      out.push(
        finding(
          'T3D_REF_SILHOUETTE',
          name,
          'silhouette IoU',
          d.iou.toFixed(3),
          `≥ ${limits.minIou}`,
          'fix the mass the photo-match overlay shows off; re-solve the camera if the photo is mis-aligned',
        ),
      );
    if (!(d.valueEmd <= limits.maxValueEmd))
      out.push(
        finding(
          'T3D_REF_VALUE',
          name,
          'value EMD',
          d.valueEmd.toFixed(3),
          `≤ ${limits.maxValueEmd}`,
          'adjust base colours / roughness so light and dark areas match the photo',
        ),
      );
    if (!(d.spectrumGap <= limits.maxSpectrumGap))
      out.push(
        finding(
          'T3D_REF_DETAIL',
          name,
          'spectrum gap',
          d.spectrumGap.toFixed(3),
          `≤ ${limits.maxSpectrumGap}`,
          'add (or remove) LOD0 surface detail until its frequency matches the photo',
        ),
      );
  }
  return out;
}

/** Gate: silhouette IoU of every reference view against the asset's orthographic outline (LOD0). */
export const refSilhouette =
  (ref: RefFile, limits: RefLimits = REF_LIMITS): Gate =>
  (asset) => {
    if (asset.lod !== 0) return [];
    const model: Partial<Record<RefViewName, Fingerprint>> = {};
    for (const name of REF_VIEWS) if (ref.views[name]) model[name] = modelOutline(asset, name);
    return refFindings(model, ref, { ...limits, maxValueEmd: Infinity, maxSpectrumGap: Infinity });
  };
