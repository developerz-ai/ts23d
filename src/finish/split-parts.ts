// Split-part generation: the community workflow (concept → crop each part → image-to-3D per part
// → align, merge and repaint by hand → rig) with the hand work replaced by what code already
// knows. The concept is cropped per part with the part-ID masks of the CPU block-out rendered at
// the concept's camera (render/part-masks.ts) plus a margin, everything outside the part's mask
// painted the background colour (the input-image rules); each crop is a `mesh` request named by
// its PNG's sha256; each result is fitted into its part's box (uniform scale, centred: the code
// owns size and place) and becomes a sculpt field edit, so seams between parts blend by `blend`.
// Per-part crops give the model more pixels per part, which is where the detail gain comes from.
// Any miss → null: the recipe keeps its code parts.

import {
  type BuildContext,
  encodePng,
  type Mesh,
  type NeuralRequests,
  type Vec3,
} from '../core/index.ts';
import { importGlb, sha256Hex } from '../neural/index.ts';
import { meshField, type SculptFieldEdit, type Similarity } from '../primitives/index.ts';
import { type PartMasks, partBox } from '../render/index.ts';

export interface ConceptImage {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface PartCrop {
  readonly part: string;
  readonly png: Uint8Array;
  readonly sha256: string;
}

/** The concept cropped to one part's mask box (+ margin), other pixels set to the background. */
export function cropPart(
  img: ConceptImage,
  masks: PartMasks,
  part: string,
  margin = 0.15,
  background: readonly [number, number, number] = [255, 255, 255],
): PartCrop | null {
  const b = partBox(masks, part, margin);
  if (!b) return null;
  const id = masks.parts.indexOf(part);
  const [x0, y0, x1, y1] = b;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const px = new Uint8Array(w * h * 4);
  // Masks are rendered at the concept's size; scale when they differ.
  const sx = img.width / masks.width;
  const sy = img.height / masks.height;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const mine = masks.ids[(y0 + y) * masks.width + x0 + x] === id;
      const ix = Math.min(img.width - 1, Math.floor((x0 + x) * sx));
      const iy = Math.min(img.height - 1, Math.floor((y0 + y) * sy));
      const k = (iy * img.width + ix) * 4;
      const c = mine ? [img.rgba[k] ?? 0, img.rgba[k + 1] ?? 0, img.rgba[k + 2] ?? 0] : background;
      px.set([c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 255], (y * w + x) * 4);
    }
  const png = encodePng(w, h, px);
  return { part, png, sha256: sha256Hex(png) };
}

/** Uniform scale + centring of `mesh` into `box` (the part's code box). */
export function fitIntoBox(mesh: Mesh, box: readonly [Vec3, Vec3]): Similarity {
  const P = mesh.positions;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3)
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a] ?? 0, P[i + a] ?? 0);
      hi[a] = Math.max(hi[a] ?? 0, P[i + a] ?? 0);
    }
  const s = Math.min(
    ...[0, 1, 2].map(
      (a) => ((box[1][a] ?? 0) - (box[0][a] ?? 0)) / Math.max((hi[a] ?? 0) - (lo[a] ?? 0), 1e-9),
    ),
  );
  const t = [0, 1, 2].map(
    (a) => ((box[0][a] ?? 0) + (box[1][a] ?? 0)) / 2 - (((lo[a] ?? 0) + (hi[a] ?? 0)) / 2) * s,
  ) as unknown as Vec3;
  return { s, r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t };
}

export interface SplitPartsOptions {
  readonly concept: ConceptImage;
  readonly masks: PartMasks;
  /** Each part's box in the asset frame (from the code block-out). */
  readonly boxes: Readonly<Record<string, readonly [Vec3, Vec3]>>;
  /** The mesh request minus its image. */
  readonly request: Omit<NeuralRequests['mesh'], 'image'>;
  readonly model?: string;
  /** SPDX licence of the model's outputs (its record.json; importGlb gates it). */
  readonly licence: string;
  /** Brick cell, metres. */
  readonly cell: number;
  /** Seam blend radius between parts, metres. */
  readonly blend: number;
  readonly margin?: number;
}

/** Every part's model surface as a sculpt field edit, or null when any part misses the cache. */
export function splitParts(
  ctx: Pick<BuildContext, 'neural'>,
  o: SplitPartsOptions,
): SculptFieldEdit[] | null {
  const edits: SculptFieldEdit[] = [];
  for (const part of Object.keys(o.boxes).sort()) {
    const box = o.boxes[part];
    const crop = cropPart(o.concept, o.masks, part, o.margin);
    if (!box || !crop) return null;
    const out = ctx.neural(
      'mesh',
      { ...o.request, image: { sha256: crop.sha256, mime: 'image/png' } },
      { ...(o.model ? { model: o.model } : {}), inputs: new Map([[crop.sha256, crop.png]]) },
    );
    const glb = out?.outputs[0];
    if (!glb) return null;
    const mesh = importGlb(
      {
        path: `split part ${part}`,
        sha256: sha256Hex(glb.bytes),
        bytes: glb.bytes,
        license: o.licence,
        author: o.model ?? 'mesh model',
        url: 'the recipe neural cache (record.json)',
      },
      { clean: false, place: 'centre' },
    ).mesh;
    edits.push({
      ...meshField(mesh, { cell: o.cell, fit: fitIntoBox(mesh, box) }),
      blend: o.blend,
    });
  }
  return edits;
}
