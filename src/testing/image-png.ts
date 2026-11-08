// RGBA images for the 2D assertions: decode a PNG (the material module's decoder: 8/16-bit grey,
// grey+alpha, RGB, RGBA or 8-bit palette, non-interlaced) or wrap raw RGBA. Anything else throws
// T3D_ASSERT_INPUT with the conversion to make.

import { Ts23dError } from '../core/index.ts';
import { decodePng } from '../material/index.ts';

export interface Image {
  readonly width: number;
  readonly height: number;
  /** RGBA8, row-major, top row first. */
  readonly data: Uint8Array;
}

function bad(cause: string): never {
  throw new Ts23dError('T3D_ASSERT_INPUT', {
    cause: `image: ${cause}`,
    fix: 'pass PNG bytes (8 or 16 bits per channel, non-interlaced) or { width, height, data: RGBA8 }',
  });
}

export const decodeImage = (bytes: Uint8Array): Image => decodePng(bytes, bad);

/** PNG bytes or an already-decoded image → Image. */
export const imageOf = (img: Uint8Array | Image): Image =>
  img instanceof Uint8Array ? decodeImage(img) : img;
