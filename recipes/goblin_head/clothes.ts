// Goblin outfit, tailored in layers over the skull stage's anatomy (../_lib/bust/cloth-*.ts): a
// rumpled linen shirt 2.5 mm thick, slack and creased in zigzags where it bunches in the vest's
// opening; an open leather vest 6 mm thick over the shoulders, its rolled edges stitched and
// rubbed pale, tension folds from each armpit; a hood worn down as a thick roll on the back of the
// neck, sagging in U folds; a knotted red scarf round the neck seam (hiding the head/bust split)
// with its tails hanging at the front.

import { type Field, hex, type IntendedCrease, type SculptEdit } from '@developerz.ai/ts23d';
import { type Fold, foldField } from '../_lib/bust/cloth-folds.ts';
import { cloth, memo, trim } from '../_lib/bust/cloth-garment.ts';
import { neckline, neckSection } from '../_lib/bust/cloth-neck.ts';
import { drag, sag, zigzag } from '../_lib/bust/cloth-paths.ts';
import { edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { chain, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import { baseZ, bustCut, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, L, TORSO } from './spec.ts';

const BOX: [V, V] = [
  [-0.3, -0.3, 0],
  [0.3, 0.3, L.mz + 0.02],
];
const SHIRT = 0.0025;
const VEST = 0.006;
const SEAM = neckSeam(L);
/** The goblin's trapezius rises ~4 cm over the seam; above the seam cloth stays behind the jaw
 *  (`behindJaw`). */
const CAP = 0.04;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
/** Cloth colours beside the spec's: the vest's scuffed edges, the shirt's grime. */
const K = { vestWorn: hex('#9a7450'), grime: hex('#8f8466') };

/** Where the outfit declares cloth (≤ 0 inside): everything it covers but the scarf's band at
 *  the neck and the last 8 mm above the bust's base. */
export function coveredArea(skin: Field): Field {
  const gather = behindJaw(neckline(neckSection(skin, SEAM, 0.07), 0.004, 0.005, CAP));
  const floor = baseZ(TORSO) + 0.008;
  return (p) => Math.max(gather(p) + 0.01, floor - p[2]);
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  const neck = neckSection(skin.field, SEAM, 0.07);
  const body = memo(skin.field);
  const fine = lod < 2;
  const floor = baseZ(TORSO);
  const gather = { region: behindJaw(neckline(neck, 0.004, 0.005, CAP)), width: 0.03 };
  const out: SculptEdit[] = [
    cloth(
      {
        body,
        thick: SHIRT,
        region: behindJaw(neckline(neck, 0.002, 0.003, CAP)),
        floor,
        // Gathered under the scarf: an abrupt shirt edge here splits the head from the bust.
        feather: gather,
        ...(fine ? { folds: foldField(shirtFolds(skin)) } : {}),
      },
      { bounds: BOX, color: C.shirt, blend: 0 },
    ),
    // Grime: the shirt darkened down the opening where it is handled.
    trim(vestRegion, -0.03, -0.004, { bounds: BOX, color: K.grime, blend: 0.012 }),
    cloth(
      {
        body,
        thick: VEST,
        region: vestRegion,
        floor,
        feather: gather,
        // Stiff leather: it hangs straight off the shoulder blades, not into the small of the back.
        drape: { x: -0.072, lean: 0.25, top: SEAM.at[2], wrap: 1.2, halfY: 0.08, within: SOCLE },
        hem: { width: 0.009, lift: 0.002, roll: 0.003 },
        ...(fine ? { stitch: { at: 0.011, depth: 0.0008, width: 0.0035 } } : {}),
        ...(fine ? { folds: foldField(vestFolds(skin)) } : {}),
      },
      { bounds: BOX, color: C.vest, blend: 0 },
    ),
    trim(vestRegion, -0.001, 0.004, { bounds: BOX, color: K.vestWorn, blend: 0.003 }),
    // Hood down: a thick roll behind the neck, sagging in U folds.
    cloth(
      {
        body,
        thick: 0.026,
        region: hoodRegion,
        floor,
        hem: { width: 0.012, lift: 0.004, roll: 0.008 },
        ...(fine ? { folds: foldField(hoodFolds(skin)) } : {}),
      },
      { bounds: BOX, color: C.hood, blend: 0.012 },
    ),
  ];
  // Scarf: a thick knotted band round the seam, the knot at the front left, tails hanging.
  const ring = scarfRing(skin.field);
  out.push(chain([...ring, ring[0] ?? SEAM.at], 0.011, { color: C.scarf, mirror: false }));
  out.push({
    shape: 'ellipsoid',
    at: scarfKnot(skin),
    size: [0.014, 0.018, 0.015],
    color: C.scarf,
    mirror: false,
  });
  if (fine)
    for (const tail of scarfTails(skin))
      out.push(
        chain(tail, [0.01, 0.009, 0.008, 0.008, 0.007, 0.007, 0.006, 0.005], {
          color: C.scarf,
          mirror: false,
        }),
      );
  return out;
}

/** A region kept below the seam, behind x = 2 cm (the hunched
 *  goblin's jaw hangs low, in front of the neck, inside the shoulders' cap). */
const behindJaw =
  (f: Field): Field =>
  (p) =>
    Math.max(f(p), Math.min(SEAM.field(p), p[0] - 0.02));

/** Vest: over the shoulders and back, open down the front in a V that widens downward (≤ 0
 *  inside). (At the neck it thins out under the scarf.) */
export const vestRegion: Field = (p) => {
  const drop = SEAM.at[2] - p[2];
  const opening = 0.02 + Math.max(drop, 0) * 0.25 - Math.abs(p[1]);
  const front = p[0] - (L.gx - 0.3 * H);
  return -Math.max(-opening, -front);
};

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: the
 *  vest's and hood's rolled edges on the skin, and the scarf where it wraps the neck's root —
 *  on both parts (the seam runs under them). */
export function outfitCreases(skin: Surface): IntendedCrease[] {
  const box: [V, V] = [
    [-0.3, -0.3, TORSO.cutZ - 0.02],
    [0.3, 0.3, L.mz],
  ];
  const ring = scarfRing(skin.field);
  const shirt = behindJaw(neckline(neckSection(skin.field, SEAM, 0.07), 0.002, 0.003, CAP));
  return ['head', 'bust'].flatMap((part) => [
    ...edgeCreases(
      `shirt_neck_${part}`,
      part,
      skin.field,
      shirt,
      box,
      0.025,
      'the shirt’s neckline',
    ),
    ...edgeCreases(
      `vest_hem_${part}`,
      part,
      skin.field,
      vestRegion,
      box,
      0.025,
      'the vest’s rolled edge',
    ),
    ...edgeCreases(
      `hood_roll_${part}`,
      part,
      skin.field,
      hoodRegion,
      box,
      0.025,
      'the hood’s roll',
    ),
    ...ringCreases(`scarf_root_${part}`, part, ring, 0.03, 'the scarf wrapping the neck’s root'),
  ]);
}

/** The hood worn down: a band behind the neck either side of the seam, bunched within 9 cm of
 *  the neck's axis (≤ 0 inside). */
export const hoodRegion: Field = (p) =>
  Math.max(
    p[0] - (SEAM.at[0] - 0.02),
    SEAM.field(p) - 0.03,
    -SEAM.field(p) - 0.015,
    Math.hypot(p[0] - SEAM.at[0], p[1]) - 0.09,
  );

/** The zigzag folds' axis down the vest's opening: top and bottom. */
const ZIG: readonly [V, V] = [
  [L.gx - 0.16 * H, 0.008, SEAM.at[2] - 0.02],
  [L.gx - 0.12 * H, 0.008, L.mz - 0.95 * H],
];

/** Shirt folds: zigzags where the slack shirt bunches in the vest's opening. */
function shirtFolds(s: Surface): Fold[] {
  const look = { amp: 0.002, width: 0.016, lift: SHIRT };
  return zigzag(s, ZIG[0], ZIG[1], [0, 1, 0], 5, 0.012, look);
}

/** Vest folds: tension from each armpit toward the opening. */
function vestFolds(s: Surface): Fold[] {
  const pit: V = [0.0, TORSO.shoulders * 0.95, L.mz - 0.75 * H];
  const to: V[] = [
    [L.gx - 0.1 * H, 0.05, L.mz - 0.6 * H],
    [L.gx - 0.1 * H, 0.05, L.mz - 0.85 * H],
  ];
  return drag(s, pit, to, { amp: 0.0025, width: 0.018, lift: VEST });
}

/** Hood folds: U folds sagging across the roll behind the neck. */
function hoodFolds(s: Surface): Fold[] {
  const y = 0.045;
  const at = (side: number): V => [SEAM.at[0] - 0.04, y * side, SEAM.at[2] + 0.02];
  return sag(s, at(1), at(-1), 0.025, 2, { amp: 0.004, width: 0.016, lift: 0.026 });
}

/** The scarf band's centre line: the neck's outline at the seam (cloth-neck.ts), on the skin. */
export function scarfRing(skin: Field): V[] {
  // The neck's smoothed outline at the seam, each point risen straight up to the skin (where
  // the outline runs inside the trapezius the band rests on the shoulders — never snapping to
  // the nearest skin, under the jaw), the heights then smoothed so the band never kinks.
  const n = neckSection(skin, SEAM, 0.07);
  const pts = Array.from({ length: 24 }, (_, i): V => {
    const a = (i / 24) * Math.PI * 2;
    const r = n.radius(a);
    const x = n.c[0] + r * Math.cos(a);
    const y = r * Math.sin(a);
    let z = n.c[2] - 0.3 * (x - n.c[0]);
    const z0 = z;
    while (skin([x, y, z]) < 0 && z < z0 + 0.05) z += 0.001;
    return [x, y, z + 0.004];
  });
  return pts.map((p, i): V => {
    const a = pts[(i + 23) % 24] ?? p;
    const b = pts[(i + 1) % 24] ?? p;
    return [p[0], p[1], (a[2] + 2 * p[2] + b[2]) / 4];
  });
}

/** The scarf knot at the front left. */
export function scarfKnot(skin: Surface): V {
  return skin.off([L.gx - 0.2 * H, 0.025, SEAM.at[2] - 0.01], 0.016);
}

/** The two scarf tails hanging from the knot. */
export function scarfTails(skin: Surface): V[][] {
  const knot = scarfKnot(skin);
  return (
    [
      [0.01, 0.07],
      [0.032, 0.055],
    ] as const
  ).map(([dy, len]) =>
    spline(
      [
        knot,
        skin.off([knot[0] - 0.01, knot[1] + dy, knot[2] - len * 0.5], 0.01),
        skin.off([knot[0] - 0.012, knot[1] + dy * 1.4, knot[2] - len], 0.008),
      ],
      8,
    ),
  );
}

/** Shirt crease lines in the vest's opening (the zigzag's diagonals, left half), for crease
 *  declarations. */
export function shirtCreases(): V[][] {
  const [top, bottom] = ZIG;
  const at = (t: number, dy: number): V => [
    top[0] + (bottom[0] - top[0]) * t,
    top[1] + dy,
    top[2] + (bottom[2] - top[2]) * t,
  ];
  return Array.from({ length: 5 }, (_, i) => {
    const k = i % 2 === 0 ? 0.012 : -0.012;
    return [at(i / 5, k), at((i + 1) / 5, -k)];
  });
}
