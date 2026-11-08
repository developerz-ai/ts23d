// Door lever or knob on a round rose. Origin = the door face, the handle stands out along +X; the
// lever points to −Y: put the rose on the free edge so the lever points at the hinges.
// Real: rose Ø 50–55 mm, lever 120–140 mm at ~60 mm projection, knob Ø 55–60 mm.

import { definePart, lathe, merge, sweep, type Vec2 } from '@developerz.ai/ts23d';
import { ZINC } from './shape.ts';

export const door_handle = definePart({
  name: 'door_handle',
  description: 'lever or knob door handle on a round rose; stands out along +X',
  tags: ['hardware', 'door'],
  params: { style: 'lever' as 'lever' | 'knob', rose: 0.052, length: 0.13 },
  schema: {
    style: { oneOf: ['lever', 'knob'] },
    rose: { min: 0.03, max: 0.09, unit: 'm', doc: 'rose diameter' },
    length: { min: 0.08, max: 0.2, unit: 'm', doc: 'lever length (ignored for a knob)' },
  },
  build(b, p) {
    const seg = b.pick([16, 10, 6]);
    const rr = p.rose / 2;
    const rose = lathe({
      profile: [
        [rr, -0.001],
        [rr, 0.004],
        [rr * 0.8, 0.009],
        [rr * 0.42, 0.011],
      ],
      segments: seg,
      caps: true,
      axis: 'x',
      color: ZINC,
      strip: 'chrome',
    });
    if (p.style === 'knob') {
      const prof: Vec2[] = [
        [rr * 0.32, 0.009],
        [rr * 0.32, 0.03],
        [0.024, 0.045],
        [0.029, 0.06],
        [0.024, 0.074],
        [0.008, 0.08],
      ];
      return merge([
        rose,
        lathe({
          profile: prof,
          segments: seg,
          caps: true,
          axis: 'x',
          color: ZINC,
          strip: 'chrome',
        }),
      ]);
    }
    const r = 0.0095;
    const bend = b.pick([5, 3, 1]);
    const path: [number, number, number][] = [[0.008, 0, 0]];
    for (let i = 0; i <= bend; i++) {
      const t = (i / bend) * (Math.PI / 2);
      path.push([0.045 + 0.018 * Math.sin(t), -0.018 * (1 - Math.cos(t)), 0]);
    }
    path.push([0.063, -p.length + r, 0]);
    const lever = sweep({
      section: { radius: r, segments: b.pick([10, 8, 6]) },
      path,
      caps: true,
      color: ZINC,
      strip: 'chrome',
    });
    return merge([rose, lever]);
  },
});
