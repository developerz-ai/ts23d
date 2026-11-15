// Stage 4 of a skull-stage head, the features as brush strokes (src/primitives sculpt-stroke.ts):
// the upper-lid fold, the nasolabial fold, the mentolabial sulcus as creases; the vermilion border
// (white roll) and the philtrum columns as pinched ridges. One table (`featureLines`) both sculpts
// each fold and declares it an intended crease (skull-creases.ts). Left side; the sculpt mirrors.

import type { SculptEdit, Vec3 } from '@developerz.ai/ts23d';
import { add, type Forms } from './planes.ts';
import type { SkullLandmarks } from './skull.ts';

/** A feature stroke's path, brush, radius and depth (shares of H) and its `Forms` knob: the
 *  same table sculpts the fold and declares it an intended crease (skull-creases.ts). */
export interface FeatureLine {
  readonly name: string;
  readonly stroke: 'crease' | 'pinch';
  readonly path: Vec3[];
  readonly radius: number;
  readonly depth: number;
  readonly knob: 'lines' | 'lips';
  readonly why: string;
}

/** The folds and edges of the face (left side), in the bust frame. */
export function featureLines(k: SkullLandmarks, H: number): FeatureLine[] {
  const R = k.eyeR;
  const cy = Math.abs(k.cheilion[1]);
  const sz = k.stomion[2] - 0.045 * H;
  return [
    {
      name: 'lid_fold',
      stroke: 'crease',
      path: [
        add(k.endocanthion, -0.002 * H, 0.002 * H, R * 0.75),
        add(k.eye, R * 0.75, 0, R * 1.2),
        add(k.exocanthion, -0.004 * H, 0.002 * H, R * 0.6),
      ],
      radius: 0.014,
      depth: 0.0035,
      knob: 'lines',
      why: 'the upper-lid fold following the orbit',
    },
    {
      name: 'nasolabial',
      stroke: 'crease',
      path: [
        add(k.alare, -0.004 * H, 0.012 * H, 0.008 * H),
        add(k.cheilion, 0.002 * H, 0.018 * H, 0.006 * H),
        add(k.cheilion, -0.012 * H, 0.02 * H, -0.03 * H),
      ],
      radius: 0.018,
      depth: 0.004,
      knob: 'lines',
      why: 'the nasolabial fold from the nose wing past the mouth corner',
    },
    {
      name: 'mentolabial',
      stroke: 'crease',
      path: [
        [k.stomion[0] - 0.012 * H, 0, sz],
        [k.stomion[0] - 0.02 * H, cy * 0.8, sz + 0.006 * H],
      ],
      radius: 0.016,
      depth: 0.003,
      knob: 'lines',
      why: 'the mentolabial sulcus between the lower lip and the chin',
    },
    {
      name: 'vermilion',
      stroke: 'pinch',
      path: [
        [k.stomion[0] + 0.002 * H, 0, k.stomion[2] + 0.024 * H],
        [k.stomion[0] - 0.002 * H, cy * 0.55, k.stomion[2] + 0.02 * H],
        add(k.cheilion, 0.002 * H, -0.004 * H, 0.004 * H),
      ],
      radius: 0.012,
      depth: 0.0018,
      knob: 'lips',
      why: 'the vermilion border (white roll) of the upper lip',
    },
    {
      name: 'philtrum',
      stroke: 'pinch',
      path: [
        add(k.subnasale, -0.002 * H, 0.012 * H, -0.006 * H),
        [k.stomion[0] + 0.002 * H, 0.016 * H, k.stomion[2] + 0.026 * H],
      ],
      radius: 0.01,
      depth: 0.0012,
      knob: 'lips',
      why: 'a philtrum column from the nose base to the lip peak',
    },
  ];
}

/** Lines and the lips' edges: crease strokes for folds, pinch for the vermilion white roll. */
export function featureStrokes(k: SkullLandmarks, H: number, f: Forms): SculptEdit[] {
  return featureLines(k, H)
    .filter((l) => f[l.knob] > 0)
    .map((l) => ({
      stroke: l.stroke,
      path: l.path,
      radius: l.radius * H,
      depth: l.depth * H * f[l.knob],
    }));
}
