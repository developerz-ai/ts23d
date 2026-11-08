// Named landmarks on the face base (MakeHuman hm08, metres, Z up, +X front), placed once by
// reading the base's profiles and depth plots (docs/research/face-base.md, "Landmarks"): anthropometric
// points on the midline, left-side points (the right side is their mirror), and body anchors that
// keep the neck and shoulders where the race preset wants them. Data only: the races move these.

import type { Vec3 } from '@developerz.ai/ts23d';

/** Points on the midline (y = 0). */
export const MIDLINE = {
  crown: [0.0696, 0, 0.8491],
  forehead: [0.1395, 0, 0.8014],
  glabella: [0.1533, 0, 0.756],
  nasion: [0.1506, 0, 0.7323],
  rhinion: [0.1583, 0, 0.7105],
  pronasale: [0.1681, 0, 0.6909],
  subnasale: [0.1558, 0, 0.6772],
  labraleSup: [0.1602, 0, 0.6683],
  labraleInf: [0.1566, 0, 0.6556],
  stomionSup: [0.1578, 0, 0.663],
  stomionInf: [0.1551, 0, 0.6589],
  pogonion: [0.1499, 0, 0.6327],
  menton: [0.1231, 0, 0.6155],
  occiput: [-0.0392, 0, 0.7442],
  vertexBack: [-0.0043, 0, 0.8321],
  nape: [-0.014, 0, 0.6106],
  throat: [0.071, 0, 0.5931],
  jugular: [0.1024, 0, 0.5022],
} as const satisfies Record<string, Vec3>;

/** Left-side points (+y); `baseLandmarks()` mirrors them. */
export const LEFT = {
  eye: [0.1245, 0.0308, 0.7284],
  endocanthion: [0.1306, 0.0162, 0.7274],
  exocanthion: [0.1315, 0.0448, 0.7307],
  upperLid: [0.1333, 0.0304, 0.7413],
  lowerLid: [0.1328, 0.0301, 0.715],
  brow: [0.1424, 0.0338, 0.7541],
  browOuter: [0.1285, 0.0515, 0.7546],
  orbitale: [0.142, 0.0327, 0.7082],
  alare: [0.1471, 0.0186, 0.6835],
  cheilion: [0.1426, 0.0282, 0.6664],
  lipUpper: [0.1566, 0.0077, 0.6641],
  lipLower: [0.1545, 0.0076, 0.6613],
  lipUpper2: [0.1538, 0.0134, 0.6638],
  lipLower2: [0.1536, 0.0129, 0.6615],
  cheek: [0.1362, 0.0441, 0.6919],
  zygion: [0.0883, 0.069, 0.7187],
  frontotemporale: [0.1134, 0.0598, 0.7718],
  euryon: [0.0443, 0.0744, 0.7799],
  parietal: [0.0343, 0.0544, 0.8246],
  gonion: [0.0468, 0.0441, 0.6427],
  jawline: [0.0663, 0.0306, 0.6271],
  mastoid: [0.0391, 0.0488, 0.6574],
  earTop: [0.0483, 0.0822, 0.7348],
  earOut: [0.0375, 0.0879, 0.7241],
  earBack: [0.0344, 0.0835, 0.716],
  tragion: [0.0602, 0.0747, 0.7048],
  earLobe: [0.052, 0.0749, 0.6857],
  neck: [0.0466, 0.0408, 0.5894],
  trapezius: [-0.0038, 0.0985, 0.5721],
  acromion: [0.0071, 0.2226, 0.5308],
  chest: [0.1262, 0.0767, 0.4615],
  back: [-0.0598, 0.0765, 0.4819],
} as const satisfies Record<string, Vec3>;

export type MidName = keyof typeof MIDLINE;
export type SideName = keyof typeof LEFT;
/** A landmark by name: midline names as-is, side names suffixed `_l` / `_r`. */
export type LandmarkName = MidName | `${SideName}_l` | `${SideName}_r`;

export const mirrorY = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** Every landmark of the base, in a fixed order (midline, then each side point L, R). */
export function baseLandmarks(): Map<LandmarkName, Vec3> {
  const out = new Map<LandmarkName, Vec3>();
  for (const [k, v] of Object.entries(MIDLINE)) out.set(k as MidName, v);
  for (const [k, v] of Object.entries(LEFT)) {
    out.set(`${k as SideName}_l`, v);
    out.set(`${k as SideName}_r`, mirrorY(v));
  }
  return out;
}

/** Head height H of the base: menton → crown (0.2336 m). */
export const BASE_H = MIDLINE.crown[2] - MIDLINE.menton[2];
