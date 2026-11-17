// Meshy request building: the mesh-model table (face caps, credits, which knobs each model takes,
// docs.meshy.ai 2026-11), the adapter's options, their up-front checks, the JSON bodies of the
// image-to-3D / multi-image-to-3D / text-to-3D preview / refine calls, and the credit estimate
// `t3d neural ls` shows. A request's `params` (texture, pbr, textureResolution, textureModel,
// geometryResolution, imageEnhancement) and its `pose` override the adapter's options, so the
// knobs that change the output are in the cache key. Every create asks for GLB only
// (target_formats); image_enhancement defaults off, because our inputs are our own concept images
// and must keep their exact look. Inputs travel as data URIs, size-checked before any POST.

import type { WireFetch } from './wire.ts';
import { failed, toBase64 } from './wire.ts';

/** Documented upload limits (docs.meshy.ai): an image, and a model sent as a data URI. */
export const MESHY_LIMITS = { imageBytes: 20 * 1024 * 1024, modelUriBytes: 100 * 1024 * 1024 };

interface MeshyModel {
  /** Highest target_polycount the model accepts (lower bound 100). */
  readonly maxFaces: number;
  /** Credits for the untextured mesh (image-to-3D, or a text-to-3D preview). */
  readonly mesh: number;
  readonly smart: boolean;
  /** Takes geometry_resolution 2k/4k ("ultra", +5 credits). */
  readonly ultra: boolean;
  /** Takes texture_resolution 8k. */
  readonly tex8k: boolean;
  /** Takes image_enhancement. */
  readonly enhance: boolean;
  /** Texture model used when none is named (a different one costs a retexture on top). */
  readonly texture?: string;
}

const STD = { smart: false, enhance: true, tex8k: true, maxFaces: 300_000, mesh: 20 } as const;
const SMART = { smart: true, ultra: false, enhance: false, tex8k: true, mesh: 5 } as const;

/** Mesh models the API takes and what each accepts. `latest` is meshy-7.1. */
export const MESHY_MODELS: Readonly<Record<string, MeshyModel>> = {
  latest: { ...STD, ultra: true, texture: 'meshy-7' },
  'meshy-7.1': { ...STD, ultra: true, texture: 'meshy-7' },
  'meshy-6': { ...STD, ultra: false, texture: 'meshy-6' },
  'meshy-6-lite': {
    ...STD,
    ultra: false,
    tex8k: false,
    enhance: false,
    mesh: 5,
    texture: 'meshy-6-lite',
  },
  'meshy-t2.5': { ...SMART, maxFaces: 30_000 },
  'meshy-t2': { ...SMART, maxFaces: 15_000 },
};

/** Share of maxTriangles asked as target_polycount: Meshy's count lands a few % over (5129/5000). */
const TARGET_SHARE = 0.9;

export interface MeshyOptions {
  /** `msy_…`. Required; read it from the environment in t3d.config.ts, not here. */
  readonly apiKey: string | undefined;
  /** Default model (listed first): one of MESHY_MODELS. Default 'latest'. */
  readonly model?: string;
  /** Default 'https://api.meshy.ai'. */
  readonly baseUrl?: string;
  /** Texture the mesh: should_texture (image-to-3D) or a refine task after the preview
   *  (text-to-3D). Default false: Meshy bakes JPEG albedo and importGlb projects PNG only. */
  readonly texture?: boolean;
  /** enable_pbr: metallic, roughness, normal maps too. Needs `texture`. */
  readonly pbr?: boolean;
  readonly poseMode?: 'a-pose' | 't-pose';
  /** texture_model (refine: ai_model), e.g. 'meshy-7', 'meshy-n1'. Needs `texture`. */
  readonly textureModel?: string;
  readonly textureResolution?: '2k' | '4k' | '8k';
  /** '2k' / '4k' is ultra geometry (+5 credits, meshy-7.1 only). */
  readonly geometryResolution?: 'standard' | '2k' | '4k';
  /** Let Meshy restyle the input image first. Default false: keep our concept's exact look. */
  readonly imageEnhancement?: boolean;
  readonly timeoutMs?: number;
  /** Whole job incl. queue, 429 waits and download, ms. Default 3 600 000 (Meshy: wait ≥ 60 min). */
  readonly jobTimeoutMs?: number;
  /** Wait between polls when the reply names no Retry-After, ms. Default 5000. */
  readonly pollMs?: number;
  /** First 429 wait without Retry-After, ms, doubled up to 60 s. Default 5000. */
  readonly backoffMs?: number;
  readonly maxBytes?: number;
  readonly fetch?: WireFetch;
  /** Where created task ids wait to be resumed (default: a file under $TS23D_HOME/meshy). */
  readonly pending?: MeshyPending;
}

/** Created-but-unfinished task ids by request hash, so a rerun polls instead of paying again. */
export interface MeshyPending {
  get(key: string): string | undefined;
  set(key: string, id: string): void;
  delete(key: string): void;
}

type Kind = 'boolean' | 'string';

/** Read a request's `params`, refusing unknown names and wrong types before any credit is spent. */
export function readParams(
  what: string,
  params: unknown,
  allowed: Readonly<Record<string, Kind | readonly string[]>>,
): Readonly<Record<string, string | boolean>> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries((params ?? {}) as Record<string, unknown>)) {
    const want = allowed[k];
    if (want === undefined)
      failed(
        `meshy ${what}: params.${k} is not a Meshy knob`,
        `use params: ${Object.keys(allowed).join(', ')}`,
      );
    const ok = typeof want === 'string' ? typeof v === want : want.includes(String(v));
    if (!ok || (typeof v !== 'string' && typeof v !== 'boolean'))
      failed(
        `meshy ${what}: params.${k} is ${JSON.stringify(v)}`,
        `pass ${typeof want === 'string' ? `a ${want}` : `one of ${want.join(', ')}`}`,
      );
    out[k] = v as string | boolean;
  }
  return out;
}

const MESH_PARAMS = {
  texture: 'boolean',
  pbr: 'boolean',
  imageEnhancement: 'boolean',
  textureModel: 'string',
  textureResolution: ['2k', '4k', '8k'],
  geometryResolution: ['standard', '2k', '4k'],
} as const;

/** The adapter's options with a mesh request's `params` and `pose` applied on top. */
export function meshOptions(o: MeshyOptions, r: Readonly<Record<string, unknown>>): MeshyOptions {
  const pose = r['pose'];
  if (pose !== undefined && pose !== 'a-pose' && pose !== 't-pose')
    failed(`meshy mesh: pose is ${JSON.stringify(pose)}`, "use pose 'a-pose' or 't-pose'");
  return {
    ...o,
    ...(readParams('mesh', r['params'], MESH_PARAMS) as Partial<MeshyOptions>),
    ...(pose === undefined ? {} : { poseMode: pose }),
  };
}

/** `bytes` as a data URI, refused before any POST when over Meshy's documented limit. */
export function dataUri(what: string, bytes: Uint8Array, mime: string, model = false): string {
  // Images: the file's size. Models: "100 MB as a data URI", read as the encoded length.
  const size = model ? Math.ceil(bytes.length / 3) * 4 : bytes.length;
  const cap = model ? MESHY_LIMITS.modelUriBytes : MESHY_LIMITS.imageBytes;
  if (size > cap)
    failed(
      `meshy ${what} is ${(size / 1048576).toFixed(1)} MB${model ? ' as a data URI' : ''}, limit ${cap / 1048576} MB`,
      model
        ? 'decimate it first (a Blender step, or a lower maxTriangles on the mesh request)'
        : 'send a smaller image (≤ 2048 px PNG is plenty)',
    );
  return `data:${mime};base64,${toBase64(bytes)}`;
}

/** Refuse knob combinations Meshy answers 400 to, before any credit is spent. */
export function checkOptions(o: MeshyOptions, id: string): void {
  const m = MESHY_MODELS[id];
  if (!m)
    failed(
      `'${id}' is not a Meshy mesh model`,
      `use one of: ${Object.keys(MESHY_MODELS).join(', ')}`,
    );
  const bad = (what: string, fix: string): never => failed(`meshy ${id}: ${what}`, fix);
  if ((o.pbr || o.textureModel || o.textureResolution) && !o.texture)
    bad('pbr / textureModel / textureResolution need a texture', 'pass texture: true');
  if (o.textureResolution === '8k' && !m.tex8k)
    bad('no 8k textures', "use textureResolution '2k' or '4k', or another model");
  if (o.geometryResolution && o.geometryResolution !== 'standard' && !m.ultra)
    bad(
      `no ${o.geometryResolution} geometry`,
      "use model 'meshy-7.1' (or 'latest') for ultra geometry",
    );
}

/** Credits one job costs as Meshy lists them (an estimate: `consumed_credits` is the truth). */
export function meshyCost(o: MeshyOptions, id: string): number {
  const m = MESHY_MODELS[id];
  if (!m) return Number.NaN;
  const texPass = o.textureResolution === '8k' ? 15 : 10;
  const ultra = o.geometryResolution === '2k' || o.geometryResolution === '4k' ? 5 : 0;
  const foreign = o.texture && o.textureModel !== undefined && o.textureModel !== m.texture;
  return m.mesh + ultra + (o.texture ? texPass : 0) + (foreign ? texPass : 0);
}

/** Geometry fields shared by image-to-3D and the text-to-3D preview. */
function geometry(o: MeshyOptions, id: string, maxTriangles?: number): Record<string, unknown> {
  const m = MESHY_MODELS[id];
  const smart = m?.smart ?? false;
  return {
    ai_model: id,
    target_formats: ['glb'],
    ...(smart ? { model_type: 'smart-topology' } : {}),
    ...(o.poseMode ? { pose_mode: o.poseMode } : {}),
    ...(o.geometryResolution ? { geometry_resolution: o.geometryResolution } : {}),
    ...(maxTriangles === undefined
      ? {}
      : {
          ...(smart ? {} : { should_remesh: true, topology: 'triangle' }),
          target_polycount: Math.max(
            100,
            Math.min(m?.maxFaces ?? 300_000, Math.floor(maxTriangles * TARGET_SHARE)),
          ),
        }),
  };
}

const textureFields = (o: MeshyOptions): Record<string, unknown> => ({
  ...(o.pbr ? { enable_pbr: true } : {}),
  ...(o.textureResolution ? { texture_resolution: o.textureResolution } : {}),
});

export function imageBody(
  o: MeshyOptions,
  id: string,
  dataUri: string,
  maxTriangles?: number,
  prompt?: string,
): Record<string, unknown> {
  const tex = o.texture ?? false;
  return {
    ...geometry(o, id, maxTriangles),
    image_url: dataUri,
    should_texture: tex,
    ...(MESHY_MODELS[id]?.enhance ? { image_enhancement: o.imageEnhancement ?? false } : {}),
    ...(tex ? textureFields(o) : {}),
    ...(tex && o.textureModel ? { texture_model: o.textureModel } : {}),
    ...(tex && prompt ? { texture_prompt: prompt } : {}),
  };
}

/** Multi-image-to-3D (1–4 views, front first): no smart-topology models, no 4k geometry. */
export function multiBody(
  o: MeshyOptions,
  id: string,
  dataUris: readonly string[],
  maxTriangles?: number,
  prompt?: string,
): Record<string, unknown> {
  if (MESHY_MODELS[id]?.smart || o.geometryResolution === '4k')
    failed(
      `meshy ${id}: multi-image-to-3d takes no ${MESHY_MODELS[id]?.smart ? 'smart-topology model' : '4k geometry'}`,
      "use model 'latest' / 'meshy-7.1' / 'meshy-6' / 'meshy-6-lite' and geometryResolution 'standard' or '2k'",
    );
  if (dataUris.length < 1 || dataUris.length > 4)
    failed(
      `meshy multi-image-to-3d got ${dataUris.length} images`,
      'send 1–4 views, front view first',
    );
  const { image_url: _one, ...rest } = imageBody(o, id, '', maxTriangles, prompt);
  return { ...rest, image_urls: dataUris };
}

export const previewBody = (
  o: MeshyOptions,
  id: string,
  prompt: string,
  maxTriangles?: number,
): Record<string, unknown> => ({ ...geometry(o, id, maxTriangles), mode: 'preview', prompt });

export const refineBody = (o: MeshyOptions, previewId: string, prompt: string) => ({
  mode: 'refine',
  preview_task_id: previewId,
  texture_prompt: prompt,
  target_formats: ['glb'],
  ...textureFields(o),
  ...(o.textureModel ? { ai_model: o.textureModel } : {}),
});
