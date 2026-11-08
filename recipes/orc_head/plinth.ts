// Turned plinth under the bust: a stepped stone socle, chamfered rims, on z = 0. The bust's cut
// face sits on its top.

import { type BuildContext, lathe, type Mesh } from '@developerz.ai/ts23d';
import { L } from './landmarks.ts';
import { C } from './palette.ts';

export function plinth(ctx: BuildContext): Mesh {
  const top = L.plinthTop;
  // Disc base, a cavetto waist and a top cap the bust's cut face sits on.
  const profile: Array<[number, number]> = [
    [0, 0],
    [0.16, 0],
    [0.165, 0.004],
    [0.165, 0.018],
    [0.156, 0.024],
    [0.138, 0.028],
    [0.118, 0.036],
    [0.104, 0.05],
    [0.1, top - 0.016],
    [0.11, top - 0.01],
    [0.118, top - 0.005],
    [0.118, top],
    [0, top],
  ];
  return lathe({
    profile,
    segments: ctx.pick([64, 32, 10]),
    color: C.plinth,
    strip: 'stone',
  });
}
