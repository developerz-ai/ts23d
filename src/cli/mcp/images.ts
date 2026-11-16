// PNG files → MCP image content blocks, so the agent sees renders inline. Each image is shrunk
// (box filter, deterministic: same PNG → same bytes) until its long edge is ≤ `maxEdge`; never
// enlarged. Once a result's byte budget is spent, the remaining images are listed by path only.

import { encodePng, Ts23dError } from '../../core/index.ts';
import { decodePng } from '../../material/index.ts';
import { resizePhoto } from '../../render/index.ts';

/** MCP `ImageContent` (protocol 2025-06-18, unchanged through 2025-11-25). */
export interface ImageBlock {
  readonly type: 'image';
  readonly data: string;
  readonly mimeType: 'image/png';
}

export interface ImageCap {
  /** Longest side in pixels after downscaling. */
  readonly maxEdge: number;
  /** Total PNG bytes (before base64) one tool result may carry. */
  readonly maxBytes: number;
}

/** 1024 px keeps a contact sheet's labels legible and stays under clients' per-image limits. */
export const IMAGE_CAP: ImageCap = { maxEdge: 1024, maxBytes: 3_000_000 };

export interface Images {
  readonly blocks: ImageBlock[];
  /** Paths left out (budget spent, or not a readable PNG), each with the reason. */
  readonly listed: { path: string; why: string }[];
}

/** PNG bytes whose long edge is ≤ maxEdge (the input itself when it already fits). */
export function fitPng(bytes: Uint8Array, maxEdge: number): Uint8Array {
  const img = decodePng(bytes, (cause) => {
    throw new Ts23dError('T3D_RENDER_OPTIONS', {
      cause: `image for the agent: ${cause}`,
      fix: 'open the file directly; t3d renders write RGBA8 PNGs',
    });
  });
  const long = Math.max(img.width, img.height);
  if (long <= maxEdge) return bytes;
  const width = Math.max(1, Math.round((img.width * maxEdge) / long));
  const small = resizePhoto(img, width);
  return encodePng(small.width, small.height, small.data);
}

/** The PNGs at `paths`, in order, as image blocks within `cap`. */
export async function imageBlocks(
  paths: readonly string[],
  cap: ImageCap = IMAGE_CAP,
): Promise<Images> {
  const blocks: ImageBlock[] = [];
  const listed: { path: string; why: string }[] = [];
  let spent = 0;
  for (const path of paths) {
    let png: Uint8Array;
    try {
      png = fitPng(new Uint8Array(await Bun.file(path).arrayBuffer()), cap.maxEdge);
    } catch (e) {
      listed.push({ path, why: `not shown: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (spent + png.length > cap.maxBytes) {
      listed.push({
        path,
        why: `not shown: over the ${cap.maxBytes}-byte image budget; read the file`,
      });
      continue;
    }
    spent += png.length;
    blocks.push({
      type: 'image',
      data: Buffer.from(png).toString('base64'),
      mimeType: 'image/png',
    });
  }
  return { blocks, listed };
}
