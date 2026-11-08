// Exhaust: per bank, five tuned primaries leave the head's outboard ports, sweep down and back
// to a 5-into-1 collector behind the front wheel, then turn out under the bodywork into the side
// pipe: a chrome-tipped silencer running along the sill under the door, wrapped in a perforated
// heat shield on stand-off brackets, exiting just ahead of the rear wheel. Heat-browned steel.

import type { Lod, Mesh, Vec3 } from '@developerz.ai/ts23d';
import { lathe, merge } from '@developerz.ai/ts23d';
import { C } from '../lib/colors.ts';
import { bx, rod, shift, tube } from '../lib/geo.ts';
import { BANKS, type Bank, bp, cylX, H_DECK } from './frame.ts';

/** Side pipe run (left; the right mirrors y). */
export const PIPE = {
  x0: 0.66,
  x1: -0.84,
  y: 0.868,
  z: 0.205,
  r: 0.052,
} as const;

function primaries(lod: Lod, b: Bank): Mesh {
  const s = b.s;
  const segs = lod === 0 ? 10 : 6;
  const collector: Vec3 = [0.66, s * 0.47, 0.25];
  const parts: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const x = cylX(b, i);
    const port = bp(b, x, H_DECK + 0.055, 0.12);
    const out = bp(b, x, H_DECK + 0.02, 0.19);
    const k = i / 4;
    const path: Vec3[] = [
      port,
      out,
      [x - 0.04, s * (0.36 + 0.012 * i), 0.36 - 0.01 * i],
      [x - 0.1 - 0.05 * (1 - k), s * (0.4 + 0.01 * i), 0.3],
      [collector[0] + 0.12, s * (0.44 + 0.006 * (i - 2)), 0.26 + 0.008 * (i - 2)],
      [collector[0] + 0.04, collector[1] + s * 0.004 * (i - 2), collector[2] + 0.004 * (i - 2)],
    ];
    parts.push(tube(path, 0.042, C.exhaust, 'iron_rust', segs, lod === 0 ? 5 : 2));
    if (lod === 0)
      parts.push(
        rod(
          bp(b, x, H_DECK + 0.055, 0.105),
          bp(b, x, H_DECK + 0.055, 0.125),
          0.07,
          C.exhaust,
          'iron_cast',
          6,
        ),
      );
  }
  // Collector cone → elbow out to the side pipe.
  parts.push(
    tube(
      [
        collector,
        [collector[0] - 0.06, s * 0.6, 0.22],
        [PIPE.x0 + 0.02, s * (PIPE.y - 0.12), PIPE.z],
        [PIPE.x0 - 0.04, s * PIPE.y, PIPE.z],
      ],
      0.075,
      C.exhaust,
      'iron_rust',
      segs,
      4,
    ),
  );
  return merge(parts);
}

function sidePipe(lod: Lod, s: 1 | -1): Mesh {
  const segs = [24, 10, 6][lod] ?? 6;
  const len = PIPE.x0 - PIPE.x1;
  const parts: Mesh[] = [
    shift(
      lathe({
        // From the open, rolled tip at x1 (rear) forward to the closed front cap at x0.
        profile: [
          [PIPE.r * 0.6, 0.04],
          [PIPE.r * 0.62, 0],
          [PIPE.r * 0.82, 0],
          [PIPE.r * 0.84, 0.02],
          [PIPE.r, 0.1],
          [PIPE.r, len - 0.06],
          [PIPE.r * 0.7, len],
          [0, len],
        ],
        segments: segs,
        axis: 'x',
        color: C.natural,
        strip: 'chrome',
        caps: false,
      }),
      [PIPE.x1, s * PIPE.y, PIPE.z],
    ),
  ];
  if (lod < 2) {
    // Perforated heat shield: an outer half-shell with rows of dark holes, on stand-offs.
    const r = PIPE.r + 0.012;
    const shield = lathe({
      profile: [
        [r, 0],
        [r, len * 0.72],
      ],
      segments: segs,
      axis: 'x',
      color: C.heatShield,
      strip: 'steel_galvanised',
      caps: false,
    });
    parts.push(shift(shield, [PIPE.x1 + len * 0.16, s * PIPE.y, PIPE.z]));
    if (lod === 0) {
      const hole = rod([0, 0, 0], [0, 0.002, 0], 0.008, [0.03, 0.03, 0.03], 'plastic', 6);
      for (let k = 0; k < 34; k++)
        for (let j = 0; j < 3; j++) {
          const x = PIPE.x1 + len * 0.18 + k * ((len * 0.68) / 33);
          const a = (j - 1) * 0.35;
          parts.push(shift(hole, [x, s * (PIPE.y + r * Math.cos(a)), PIPE.z + r * Math.sin(a)]));
        }
      for (const f of [0.2, 0.5, 0.82]) {
        const x = PIPE.x1 + len * f;
        const band = lathe({
          profile: [
            [r + 0.001, 0],
            [r + 0.004, 0.004],
            [r + 0.004, 0.016],
            [r + 0.001, 0.02],
          ],
          segments: segs,
          axis: 'x',
          color: C.natural,
          strip: 'chrome',
          caps: false,
        });
        parts.push(shift(band, [x, s * PIPE.y, PIPE.z]));
      }
    }
  }
  // Hanger brackets up to the sill (every LOD: they are what holds the pipe up).
  for (const f of [0.15, 0.85]) {
    const x = PIPE.x1 + len * f;
    parts.push(
      bx(
        [x - 0.012, s * (PIPE.y - 0.07), PIPE.z + 0.03],
        [x + 0.012, s * (PIPE.y - 0.03), PIPE.z + 0.075],
        C.ironDark,
        'iron_cast',
      ),
    );
  }
  return merge(parts);
}

export function exhaust(lod: Lod): Mesh {
  const parts: Mesh[] = [];
  for (const b of BANKS) {
    if (lod < 2) parts.push(primaries(lod, b));
    parts.push(sidePipe(lod, b.s));
  }
  return merge(parts);
}

/** Tailpipe tip centre (for the smoke emitter), left side. */
export const PIPE_TIP: Vec3 = [PIPE.x1, PIPE.y, PIPE.z];
