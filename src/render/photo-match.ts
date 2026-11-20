// Photo match: render the asset from the camera that took a reference photo and stack
// photo · model · overlay in ONE image, plus silhouette IoU and an error map. The camera is given,
// or solved from ≥ 4 marked correspondences and then refined on IoU (pattern search over eye,
// target and field of view). The strongest check an agent has: silhouette, proportions and colour
// against reality at a glance. Deterministic: same asset + photo + marks → same bytes.

import { type CompiledAsset, dmath, encodePng, Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { type Mark, type PhotoCamera, perspectiveOf, solveCamera } from './camera-solve.ts';
import { type Photo, resizePhoto, segmentPhoto } from './photo-segment.ts';
import { sceneOf } from './scene.ts';
import { rasteriseVis } from './vis-buffer.ts';

export type { Mark, PhotoCamera } from './camera-solve.ts';

export interface PhotoMatchOptions {
  /** PNG bytes (RGBA/RGB/grey); alpha, when present, is the object mask. Convert JPEGs first. */
  readonly photo: Uint8Array;
  /** The photo's camera; required unless `marks` are given. */
  readonly camera?: PhotoCamera;
  /** ≥ 4 photo-pixel ↔ asset-point pairs (pixels of the original photo): solve the camera. */
  readonly marks?: readonly Mark[];
  /** Output panel width (the photo is box-filtered down). Default min(photo width, 640). */
  readonly width?: number;
  /** Refine a solved camera on silhouette IoU. Default true. */
  readonly refine?: boolean;
}

export interface PhotoMatch {
  /** Photo on top, model in the middle, 50% overlay with misses tinted at the bottom. */
  readonly png: Uint8Array;
  readonly iou: number;
  readonly camera: PhotoCamera;
  /** Per panel pixel: 0 agree, 1 photo only (model missing), 2 model only (model excess). */
  readonly errorMap: Uint8Array;
  readonly width: number;
  readonly height: number;
}

const toSrgb = (v: number): number =>
  Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * dmath.pow(v, 1 / 2.4) - 0.055));

/** The asset from a photo camera: RGBA (alpha 0 = background) and its mask (1 = asset). */
export function photoView(
  asset: CompiledAsset,
  camera: PhotoCamera,
  width: number,
  height: number,
): { rgba: Uint8Array; mask: Uint8Array } {
  const s = sceneOf(asset);
  const cam = perspectiveOf(camera, width, height);
  const vis = rasteriseVis(s, cam, 1024);
  const light = [0, 1, 2].map(
    (k) => -0.6 * (cam.f[k] ?? 0) + 0.5 * (cam.u[k] ?? 0) + 0.3 * (cam.r[k] ?? 0),
  );
  const ll = dmath.hypot(light[0] ?? 0, light[1] ?? 0, light[2] ?? 0);
  const rgba = new Uint8Array(width * height * 4);
  const mask = new Uint8Array(width * height);
  const P = s.positions;
  for (let i = 0; i < mask.length; i++) {
    const t = vis.tri[i] ?? -1;
    if (t < 0) continue;
    const [a, b, c] = [0, 1, 2].map((k) => s.indices[t * 3 + k] ?? 0) as [number, number, number];
    const e1 = [0, 1, 2].map((k) => (P[b * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const e2 = [0, 1, 2].map((k) => (P[c * 3 + k] ?? 0) - (P[a * 3 + k] ?? 0));
    const n = [
      (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0),
      (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0),
      (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0),
    ];
    const nl = dmath.hypot(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0) * ll || 1;
    const shade = 0.3 + 0.7 * Math.abs(n.reduce((sum, v, k) => sum + v * (light[k] ?? 0), 0) / nl);
    const rgb = [0, 1, 2].map((k) =>
      toSrgb(
        (((s.colors[a * 3 + k] ?? 1) + (s.colors[b * 3 + k] ?? 1) + (s.colors[c * 3 + k] ?? 1)) /
          3) *
          shade,
      ),
    );
    rgba.set([...rgb, 255], i * 4);
    mask[i] = 1;
  }
  return { rgba, mask };
}

function iouOf(a: Uint8Array, b: Uint8Array): number {
  let [inter, union] = [0, 0];
  for (let i = 0; i < a.length; i++) {
    inter += (a[i] ?? 0) & (b[i] ?? 0);
    union += (a[i] ?? 0) | (b[i] ?? 0);
  }
  return union === 0 ? 1 : inter / union;
}

/** Pattern search on eye, target (2% of the viewing distance, halving) and fov (1°). */
function refineOnIoU(
  asset: CompiledAsset,
  cam: PhotoCamera,
  photo: Photo,
  mask: Uint8Array,
): PhotoCamera {
  const score = (c: PhotoCamera): number =>
    iouOf(photoView(asset, c, photo.width, photo.height).mask, mask);
  const dist = dmath.hypot(
    cam.eye[0] - cam.target[0],
    cam.eye[1] - cam.target[1],
    cam.eye[2] - cam.target[2],
  );
  const vec = (c: PhotoCamera): number[] => [...c.eye, ...c.target, c.fovDeg];
  const cameraOf = (v: number[]): PhotoCamera => ({
    eye: [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0],
    target: [v[3] ?? 0, v[4] ?? 0, v[5] ?? 0],
    fovDeg: Math.min(120, Math.max(1, v[6] ?? 30)),
  });
  let best = vec(cam);
  let bestScore = score(cam);
  for (const scale of [1, 0.5, 0.25])
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let k = 0; k < best.length; k++)
        for (const sign of [1, -1]) {
          const trial = [...best];
          trial[k] = (trial[k] ?? 0) + sign * scale * (k === 6 ? 1 : 0.02 * dist);
          const s = score(cameraOf(trial));
          if (s > bestScore) [best, bestScore, moved] = [trial, s, true];
        }
      if (!moved) break;
    }
  return cameraOf(best);
}

/** Stack photo · model · overlay; returns the sheet with IoU, the camera used and the error map. */
export function photoMatch(asset: CompiledAsset, o: PhotoMatchOptions): PhotoMatch {
  const fail = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_RENDER_OPTIONS', { cause: `photoMatch: ${cause}`, fix });
  };
  const original = decodePng(o.photo, (cause) =>
    fail(cause, 'pass PNG bytes (convert a JPEG first, e.g. `ffmpeg -i photo.jpg photo.png`)'),
  );
  const width = Math.round(o.width ?? Math.min(original.width, 640));
  if (!(width >= 16 && width <= 4096)) fail(`width ${width}`, 'pass a width between 16 and 4096');
  const photo = resizePhoto(original, width);
  const { height } = photo;
  const mask = segmentPhoto(photo);
  let camera: PhotoCamera;
  if (o.marks) {
    const k = photo.width / original.width;
    const marks = o.marks.map((m): Mark => ({ px: [m.px[0] * k, m.px[1] * k], world: m.world }));
    camera = solveCamera(marks, photo.width, height).camera;
    if (o.refine !== false) camera = refineOnIoU(asset, camera, photo, mask);
  } else if (o.camera) camera = o.camera;
  else return fail('neither camera nor marks', 'pass `camera`, or ≥ 4 `marks` to solve it');
  const model = photoView(asset, camera, width, height);
  const n = width * height;
  const errorMap = new Uint8Array(n);
  const out = new Uint8Array(n * 4 * 3);
  for (let i = 0; i < n; i++) {
    const [pm, mm] = [mask[i] ?? 0, model.mask[i] ?? 0];
    errorMap[i] = pm === mm ? 0 : pm ? 1 : 2;
    const ph = [0, 1, 2].map((k) => photo.data[i * 4 + k] ?? 0);
    const md = mm ? [0, 1, 2].map((k) => model.rgba[i * 4 + k] ?? 0) : [232, 232, 232];
    const tint = errorMap[i] === 1 ? [255, 0, 255] : errorMap[i] === 2 ? [0, 220, 255] : null;
    const mix = ph.map((v, k) => (v + (md[k] ?? 0)) / 2);
    const ov = tint
      ? mix.map((v, k) => Math.round(v * 0.4 + (tint[k] ?? 0) * 0.6))
      : mix.map(Math.round);
    out.set([...ph, 255], i * 4);
    out.set([...md, 255], (n + i) * 4);
    out.set([...ov, 255], (2 * n + i) * 4);
  }
  return {
    png: encodePng(width, height * 3, out),
    iou: iouOf(mask, model.mask),
    camera,
    errorMap,
    width,
    height,
  };
}
