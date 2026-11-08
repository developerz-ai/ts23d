// Turned plinth under a bust: a disc base, a cavetto waist and a top cap the bust's cut face sits
// on, on z = 0. Sized by its base radius and height.

import { type BuildContext, lathe, type Mesh, type StripId, type V } from './deps.ts';

export function plinth(
  ctx: BuildContext,
  o: { readonly radius: number; readonly top: number; readonly color: V; readonly strip?: StripId },
): Mesh {
  const r = o.radius;
  const top = o.top;
  const profile: Array<[number, number]> = [
    [0, 0],
    [r, 0],
    [r * 1.03, top * 0.035],
    [r * 1.03, top * 0.16],
    [r * 0.975, top * 0.21],
    [r * 0.86, top * 0.245],
    [r * 0.74, top * 0.31],
    [r * 0.65, top * 0.43],
    [r * 0.625, top - top * 0.14],
    [r * 0.69, top - top * 0.09],
    [r * 0.74, top - top * 0.045],
    [r * 0.74, top],
    [0, top],
  ];
  return lathe({
    profile,
    segments: ctx.pick([64, 32, 10]),
    color: o.color,
    strip: o.strip ?? 'stone',
  });
}
