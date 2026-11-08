// The body surface as a tape-drawing curve network. Nine longitudinal "lines" (centre crown,
// dome/hump, hood valley, fender crown, shoulder crease, side character, lower side, rocker,
// underside) are each given by plan (y) and elevation (z) tables over x; at both ends they round
// in plan (superellipse) and converge onto the centre-line nose / tail profile. A section through
// the lines at parameter s is a centripetal Catmull-Rom curve in u (one unit per line, extra
// knots either side of the shoulder crease so it reads crisp). S(s, u) is the left half (y ≥ 0);
// the right half is its mirror. s = x (m) in the middle; the end caps get [−1, 0] / [0, 1] extra.

import type { Vec2, Vec3 } from '@developerz.ai/ts23d';
import { X_NOSE, X_TAIL } from '../dims.ts';
import { curve, lerp3, splineAt } from '../lib/geo.ts';
import type { Surface } from '../lib/grid.ts';

/** Where the plan starts rounding into the nose / tail. */
export const X_NR = 1.5;
export const X_TR = -1.8;
/** Parameter length of each end cap. */
export const CAP = 0.6;
export const S_MIN = X_TR - CAP;
export const S_MAX = X_NR + CAP;
const P_NOSE = 2.35;
const P_TAIL = 3.2;

interface Line {
  readonly name: string;
  /** y over x in the middle (x ∈ [X_TR, X_NR]). */
  readonly y: readonly Vec2[];
  /** z over x, through the caps to the line's end. */
  readonly z: readonly Vec2[];
  /** x where the line meets the centre line at the nose / tail. */
  readonly noseX: number;
  readonly tailX: number;
}

// Lines, top centre → underside. Knot tables are (x, value), x ascending.
const LINES: readonly Line[] = [
  {
    name: 'centre',
    y: [
      [X_TR, 0],
      [X_NR, 0],
    ],
    z: [
      [-2.17, 0.915],
      [-1.95, 0.918],
      [-1.6, 0.922],
      [-1.25, 0.928],
      [-0.9, 0.93],
      [-0.5, 0.9],
      [0, 0.89],
      [0.34, 0.902],
      [0.8, 0.864],
      [1.255, 0.808],
      [1.5, 0.764],
      [1.8, 0.692],
      [1.98, 0.605],
    ],
    noseX: 1.98,
    tailX: -2.17,
  },
  {
    name: 'dome',
    y: [
      [X_TR, 0.37],
      [-1.255, 0.36],
      [-0.9, 0.35],
      [-0.5, 0.34],
      [0.34, 0.3],
      [0.8, 0.26],
      [X_NR, 0.25],
    ],
    z: [
      [-2.19, 0.918],
      [-1.95, 0.928],
      [-1.6, 0.955],
      [-1.25, 0.985],
      [-0.9, 1.02],
      [-0.6, 0.94],
      [-0.2, 0.9],
      [0.34, 0.9],
      [0.8, 0.858],
      [1.255, 0.8],
      [1.5, 0.756],
      [1.8, 0.684],
      [2.02, 0.598],
    ],
    noseX: 2.02,
    tailX: -2.19,
  },
  {
    name: 'valley',
    y: [
      [X_TR, 0.6],
      [-1.255, 0.61],
      [-0.9, 0.6],
      [-0.5, 0.58],
      [0.34, 0.56],
      [0.8, 0.55],
      [X_NR, 0.545],
    ],
    z: [
      [-2.205, 0.925],
      [-1.95, 0.928],
      [-1.6, 0.94],
      [-1.25, 0.945],
      [-0.9, 0.93],
      [-0.5, 0.9],
      [0, 0.885],
      [0.34, 0.888],
      [0.8, 0.84],
      [1.255, 0.782],
      [1.5, 0.742],
      [1.8, 0.668],
      [2.07, 0.585],
    ],
    noseX: 2.07,
    tailX: -2.205,
  },
  {
    name: 'crown',
    y: [
      [X_TR, 0.79],
      [-1.6, 0.8],
      [-1.255, 0.805],
      [-0.95, 0.785],
      [-0.6, 0.755],
      [-0.25, 0.745],
      [0.1, 0.748],
      [0.45, 0.762],
      [0.8, 0.78],
      [1.255, 0.79],
      [X_NR, 0.785],
    ],
    z: [
      [-2.22, 0.93],
      [-1.95, 0.935],
      [-1.6, 0.958],
      [-1.255, 0.975],
      [-0.95, 0.955],
      [-0.6, 0.9],
      [-0.25, 0.878],
      [0.1, 0.878],
      [0.45, 0.885],
      [0.8, 0.878],
      [1.255, 0.864],
      [1.5, 0.832],
      [1.8, 0.752],
      [2.12, 0.575],
    ],
    noseX: 2.12,
    tailX: -2.22,
  },
  {
    name: 'shoulder',
    y: [
      [X_TR, 0.9],
      [-1.6, 0.925],
      [-1.255, 0.935],
      [-0.95, 0.908],
      [-0.6, 0.858],
      [-0.25, 0.842],
      [0.1, 0.846],
      [0.45, 0.866],
      [0.8, 0.895],
      [1.255, 0.91],
      [X_NR, 0.9],
    ],
    z: [
      [-2.235, 0.9],
      [-1.95, 0.885],
      [-1.6, 0.9],
      [-1.255, 0.91],
      [-0.95, 0.885],
      [-0.6, 0.845],
      [-0.25, 0.83],
      [0.1, 0.832],
      [0.45, 0.835],
      [0.8, 0.83],
      [1.255, 0.815],
      [1.5, 0.782],
      [1.8, 0.7],
      [2.2, 0.49],
    ],
    noseX: 2.2,
    tailX: -2.235,
  },
  {
    name: 'side',
    y: [
      [X_TR, 0.955],
      [-1.6, 0.968],
      [-1.255, 0.97],
      [-0.95, 0.95],
      [-0.6, 0.905],
      [-0.25, 0.89],
      [0.1, 0.895],
      [0.45, 0.915],
      [0.8, 0.945],
      [1.255, 0.955],
      [X_NR, 0.95],
    ],
    z: [
      [-2.225, 0.73],
      [-1.95, 0.71],
      [-1.6, 0.685],
      [-1.255, 0.665],
      [-0.9, 0.64],
      [-0.5, 0.612],
      [0, 0.595],
      [0.4, 0.595],
      [0.8, 0.605],
      [1.255, 0.61],
      [1.5, 0.59],
      [1.8, 0.535],
      [2.225, 0.44],
    ],
    noseX: 2.225,
    tailX: -2.225,
  },
  {
    name: 'lower',
    y: [
      [X_TR, 0.925],
      [-1.6, 0.94],
      [-1.255, 0.945],
      [-0.95, 0.92],
      [-0.6, 0.875],
      [-0.25, 0.862],
      [0.1, 0.865],
      [0.45, 0.885],
      [0.8, 0.915],
      [1.255, 0.925],
      [X_NR, 0.915],
    ],
    z: [
      [-2.21, 0.5],
      [-1.95, 0.43],
      [-1.6, 0.36],
      [-1.255, 0.325],
      [-0.9, 0.305],
      [-0.5, 0.295],
      [0, 0.292],
      [0.4, 0.295],
      [0.8, 0.305],
      [1.255, 0.31],
      [1.5, 0.305],
      [1.8, 0.29],
      [2.17, 0.27],
    ],
    noseX: 2.17,
    tailX: -2.21,
  },
  {
    name: 'rocker',
    y: [
      [X_TR, 0.87],
      [-1.255, 0.89],
      [-0.95, 0.86],
      [-0.6, 0.83],
      [-0.25, 0.82],
      [0.1, 0.822],
      [0.45, 0.835],
      [0.8, 0.865],
      [1.255, 0.885],
      [X_NR, 0.875],
    ],
    z: [
      [-2.17, 0.4],
      [-1.95, 0.31],
      [-1.6, 0.22],
      [-1.255, 0.172],
      [-0.9, 0.145],
      [-0.5, 0.132],
      [0, 0.13],
      [0.4, 0.132],
      [0.8, 0.142],
      [1.255, 0.152],
      [1.5, 0.158],
      [1.8, 0.162],
      [2.12, 0.17],
    ],
    noseX: 2.12,
    tailX: -2.17,
  },
  {
    name: 'under',
    y: [
      [X_TR, 0.68],
      [-0.9, 0.67],
      [0, 0.66],
      [0.8, 0.67],
      [X_NR, 0.68],
    ],
    z: [
      [-2.1, 0.385],
      [-1.95, 0.3],
      [-1.6, 0.205],
      [-1.255, 0.162],
      [-0.9, 0.132],
      [-0.5, 0.122],
      [0, 0.12],
      [0.4, 0.122],
      [0.8, 0.13],
      [1.255, 0.14],
      [1.5, 0.146],
      [1.8, 0.15],
      [2.03, 0.155],
    ],
    noseX: 2.03,
    tailX: -2.1,
  },
];

/** u index of each line in the section (with the crease's extra knots). */
export const U = {
  centre: 0,
  dome: 1,
  valley: 2,
  crown: 3,
  creaseIn: 4,
  shoulder: 5,
  creaseOut: 6,
  side: 7,
  lower: 8,
  rocker: 9,
  under: 10,
} as const;
export const U_MAX = 10;

const superY = (t: number, p: number): number => Math.cos(t) ** (2 / p);
const superX = (t: number, p: number): number => Math.sin(t) ** (2 / p);

/** The line's 3D point at body parameter s. */
function linePoint(l: Line, s: number): Vec3 {
  if (s > X_NR) {
    const th = (Math.min(1, (s - X_NR) / CAP) * Math.PI) / 2;
    const x = X_NR + (l.noseX - X_NR) * superX(th, P_NOSE);
    return [x, curve(l.y, X_NR) * superY(th, P_NOSE), curve(l.z, x)];
  }
  if (s < X_TR) {
    const th = (Math.min(1, (X_TR - s) / CAP) * Math.PI) / 2;
    const x = X_TR + (l.tailX - X_TR) * superX(th, P_TAIL);
    return [x, curve(l.y, X_TR) * superY(th, P_TAIL), curve(l.z, x)];
  }
  return [s, curve(l.y, s), curve(l.z, s)];
}

/** The section's knots at s (C, dome, valley, crown, crease-, shoulder, crease+, side…). */
export function knots(s: number): Vec3[] {
  const p = LINES.map((l) => linePoint(l, s));
  const get = (i: number): Vec3 => p[i] ?? [0, 0, 0];
  const crown = get(3);
  const sh = get(4);
  const side = get(5);
  const k = 0.06; // fraction of the span to the neighbours: the crease radius
  return [
    get(0),
    get(1),
    get(2),
    crown,
    lerp3(sh, crown, k),
    sh,
    lerp3(sh, side, k * 0.8),
    side,
    get(6),
    get(7),
    get(8),
  ];
}

const mirrorGhost = (p: Vec3): Vec3 => [p[0], -p[1], p[2]];

/** The body surface (left half). Rows are cached: patches revisit the same s many times. */
export function bodySurface(): Surface {
  const cache = new Map<number, (u: number) => Vec3>();
  return {
    sRange: [S_MIN, S_MAX],
    uRange: [0, U_MAX],
    row(s: number) {
      const hit = cache.get(s);
      if (hit) return hit;
      const k = knots(s);
      const ghost = mirrorGhost(k[1] ?? [0, 0, 0]);
      const f = (u: number): Vec3 => splineAt(k, u, ghost);
      if (cache.size > 20000) cache.clear();
      cache.set(s, f);
      return f;
    },
  };
}

/** Body parameter s where line `name` reaches x (inside a cap; the middle is s = x). */
export function sAtX(x: number, lineIndex = 0): number {
  if (x <= X_NR && x >= X_TR) return x;
  const l = LINES[lineIndex] ?? LINES[0];
  if (!l) return x;
  let lo = x > X_NR ? X_NR : S_MIN;
  let hi = x > X_NR ? S_MAX : X_TR;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (linePoint(l, m)[0] < x) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

export const LINE_COUNT = LINES.length;
export const NOSE_X = X_NOSE;
export const TAIL_X = X_TAIL;
