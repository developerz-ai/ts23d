// Induction: a cast-aluminium plenum along the valley with ten curved runners looping out and
// down into the intake ports, the throttle body on the plenum nose, a silicone-and-steel intake
// duct forward to the air box (filter housing with clips and the MAF sensor), and the PCV and
// vacuum lines. All shaped so the plenum top stays under the closed hood.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge } from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { bx, rod, shift, tube } from '../lib/geo.ts';
import { BANKS, bp, cylX, H_DECK } from './frame.ts';
import { headSpan } from './heads.ts';

export const PLENUM_Z = 0.7;
const PLENUM_TOP = 0.768;

export function intake(lod: Lod): Mesh {
  const lb = BANKS[0];
  const rb = BANKS[1];
  if (!lb || !rb) return merge([]);
  const x0 = Math.min(headSpan(lb)[0], headSpan(rb)[0]) + 0.03;
  const x1 = Math.max(headSpan(lb)[1], headSpan(rb)[1]) - 0.01;
  const segs = lod === 0 ? 14 : 7;
  const parts: Mesh[] = [
    bx(
      [x0, -0.075, PLENUM_Z - 0.03],
      [x1, 0.075, PLENUM_TOP],
      C.alloyCast,
      'aluminium',
      lod === 0 ? 0.025 : 0,
    ),
  ];
  if (lod < 2) {
    for (const b of BANKS)
      for (let i = 0; i < 5; i++) {
        const x = cylX(b, i);
        const port = bp(b, x, H_DECK + 0.065, -0.13);
        const s = b.s;
        const path: Vec3[] = [
          [x, s * 0.06, PLENUM_Z + 0.03],
          [x, s * 0.12, PLENUM_Z + 0.045],
          [x, s * 0.175, PLENUM_Z + 0.005],
          [x, s * 0.17, port[2] + 0.03],
          port,
        ];
        parts.push(tube(path, 0.044, C.alloyCast, 'aluminium', segs, lod === 0 ? 5 : 2));
        if (lod === 0) {
          // Port flange where the runner bolts to the head.
          parts.push(
            rod(
              [port[0], port[1] + s * 0.004, port[2] + 0.004],
              [port[0], port[1] - s * 0.008, port[2] - 0.008],
              0.062,
              C.alloyCast,
              'aluminium',
              segs,
            ),
          );
        }
      }
  }
  // Throttle body on the plenum nose.
  const tb: Vec3 = [x1 + 0.035, 0, PLENUM_Z + 0.02];
  parts.push(
    shift(
      lathe({
        profile: [
          [0.0, -0.035],
          [0.05, -0.035],
          [0.052, 0.0],
          [0.046, 0.04],
          [0.0, 0.04],
        ],
        segments: segs * 2,
        axis: 'x',
        color: C.natural,
        strip: 'aluminium',
      }),
      tb,
    ),
  );
  if (lod === 0)
    parts.push(
      bx(
        [tb[0] - 0.02, 0.05, tb[2] - 0.02],
        [tb[0] + 0.02, 0.075, tb[2] + 0.025],
        C.black,
        'plastic',
        0.003,
      ),
    );
  // Intake duct: throttle body → air box (front left of the bay).
  const box0: Vec3 = [1.44, 0.17, 0.5];
  const box1: Vec3 = [1.66, 0.44, 0.66];
  parts.push(
    tube(
      [
        [tb[0] + 0.04, 0, tb[2]],
        [tb[0] + 0.1, 0.02, tb[2] - 0.01],
        [1.42, 0.12, 0.62],
        [1.48, 0.24, 0.6],
      ],
      0.09,
      C.black,
      'rubber',
      segs,
      4,
    ),
  );
  parts.push(bx(box0, box1, C.black, 'plastic', lod === 0 ? 0.012 : 0));
  if (lod === 0) {
    // Lid seam, clips, MAF sensor body.
    parts.push(
      bx(
        [box0[0] - 0.003, box0[1] - 0.003, 0.585],
        [box1[0] + 0.003, box1[1] + 0.003, 0.592],
        C.ironDark,
        'plastic',
      ),
    );
    for (const x of [1.48, 1.62])
      for (const y of [box0[1] - 0.006, box1[1] + 0.006])
        parts.push(
          bx([x - 0.01, y - 0.003, 0.575], [x + 0.01, y + 0.003, 0.61], C.natural, 'chrome'),
        );
    parts.push(bx([1.46, 0.2, 0.595], [1.5, 0.24, 0.63], C.ironDark, 'plastic', 0.003));
    // PCV hoses from the covers to the plenum.
    for (const b of BANKS) {
      const [, hx] = headSpan(b);
      parts.push(
        tube(
          [
            bp(b, hx - 0.06, H_DECK + 0.2, -0.04),
            [hx - 0.05, b.s * 0.1, PLENUM_TOP + 0.005],
            [hx - 0.08, b.s * 0.05, PLENUM_TOP],
          ],
          0.014,
          C.hoseBlack,
          'rubber',
          6,
          3,
        ),
      );
    }
    // Plenum casting ribs and its bolts.
    for (let k = 0; k < 6; k++) {
      const x = x0 + 0.06 + k * ((x1 - x0 - 0.12) / 5);
      parts.push(
        bx(
          [x - 0.006, -0.07, PLENUM_TOP - 0.004],
          [x + 0.006, 0.07, PLENUM_TOP + 0.004],
          C.alloyCast,
          'aluminium',
          0.002,
        ),
      );
    }
  }
  return merge(parts);
}

export const PLENUM_HEIGHT = PLENUM_TOP;
