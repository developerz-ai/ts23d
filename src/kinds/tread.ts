// Track belts as moving parts: a belt centre line drawn in the side (XZ) plane becomes the part's
// `tread` motion, so the track gets its own pivot node and engines can run the links round it.

import { type Tread, Ts23dError, type Vec2 } from '../core/index.ts';

/**
 * The `motion` for a track part whose belt centre line is `line` (x along the hull, z up, either
 * winding) at track centre `y`; `pitch` is the link pitch (twice it when links alternate).
 */
export function tread(line: readonly Vec2[], y: number, pitch: number): Tread {
  const bad = (cause: string, fix: string): never => {
    throw new Ts23dError('T3D_RECIPE_INVALID', { cause, fix });
  };
  if (line.length < 3)
    bad(
      `tread: the belt line has ${line.length} point(s)`,
      'pass the closed belt centre line round sprocket, wheels and idler (≥ 3 points)',
    );
  if (!(pitch > 0))
    bad(
      `tread: pitch ${pitch} is not a positive length`,
      'pass the link pitch in metres, e.g. 0.172',
    );
  if (![y, ...line.flat()].every(Number.isFinite))
    bad('tread: the belt line or y has a NaN or Infinity', 'pass finite metre values');
  return { kind: 'tread', path: line.map(([x, z]) => [x, y, z] as const), pitch };
}
