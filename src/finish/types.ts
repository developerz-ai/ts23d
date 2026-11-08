// The finish layer's vocabulary: control views (what an image model is conditioned on), the model
// adapter contract, the cache store, and the provenance a finished asset carries. Types only.

import type { PerspectiveCamera } from '../render/index.ts';

/** One camera's deterministic conditioning buffers, all `width × height`, row 0 = top. */
export interface ControlView {
  /** `orbit_0` … `orbit_<n-2>`, `top`. */
  readonly name: string;
  readonly azDeg: number;
  readonly elDeg: number;
  readonly camera: PerspectiveCamera;
  readonly width: number;
  readonly height: number;
  /** Index into `ControlViews.parts` per pixel; −1 = background. */
  readonly part: Int32Array;
  /** Triangle index inside that part's mesh; −1 = background. */
  readonly tri: Int32Array;
  /** Perspective-correct barycentrics of the triangle's vertices 1 and 2. */
  readonly b1: Float32Array;
  readonly b2: Float32Array;
  /** View depth in metres along the camera axis; Infinity = background. */
  readonly depth: Float32Array;
  /** World position and world unit normal, xyz per pixel (0 on background). */
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** Atlas UV per pixel, uv pairs (−1 on background and on parts the finish leaves alone). */
  readonly uv: Float32Array;
  /** Unlit base colour (vertex colour × trim albedo), RGBA8 sRGB; background transparent black. */
  readonly albedo: Uint8Array;
  /** The lit beauty render from the same camera (RGBA8), when requested. */
  readonly beauty?: Uint8Array;
}

/** Every view of one asset plus the part legend; `hash` keys the model cache. */
export interface ControlViews {
  readonly asset: string;
  /** Part names in id order (the part-id map's legend). */
  readonly parts: readonly string[];
  /** Which of `parts` the finish paints (opaque, unpainted, no named finish, no glow). */
  readonly finishable: readonly boolean[];
  readonly views: readonly ControlView[];
  /** sha256 of every input a model sees: legend, cameras, albedo, depth and part ids. */
  readonly hash: string;
}

/** What a finish model is asked for. */
export interface FinishRequest {
  readonly views: ControlViews;
  readonly prompt: string;
  readonly negative?: string;
  readonly seed: number;
  /** Declared palette ('#rrggbb'), passed through to the model as a colour constraint. */
  readonly palette?: readonly string[];
}

/**
 * An image model that returns one RGB(A) PNG per view, pixel-aligned with the control maps.
 * `id` names the model and version; it is part of the cache key and the provenance.
 */
export interface FinishModel {
  readonly id: string;
  /** Licence / terms of the generated images, recorded in the provenance. */
  readonly licence?: string;
  run(request: FinishRequest): Promise<Uint8Array[]>;
}

/** Where model outputs are kept, by cache key: replays run offline (the gate never runs a model). */
export interface FinishStore {
  get(key: string): Promise<Uint8Array[] | undefined>;
  set(key: string, images: readonly Uint8Array[]): Promise<void>;
}

/** Recorded in the GLB (`extras.ts23d.finish`) and the CLI's finish.json. */
export interface FinishProvenance {
  readonly model: string;
  readonly prompt: string;
  readonly negative?: string;
  readonly seed: number;
  /** Cache key: sha256 of (control-map hash, views, prompt, negative, seed, palette, model). */
  readonly key: string;
  readonly views: readonly string[];
  readonly atlas: number;
  readonly licence: string;
  /** Plain-language note on what is heuristic (roughness / detail normal estimates). */
  readonly note: string;
}

/** A finish QA finding: `T3D_FINISH_*` code, measured value, and the fix. */
export interface FinishFinding {
  readonly code: 'T3D_FINISH_PALETTE_DRIFT' | 'T3D_FINISH_MASK_LEAK';
  readonly part?: string;
  readonly view?: string;
  readonly message: string;
  readonly fix: string;
}
