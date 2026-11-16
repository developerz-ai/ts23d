// Elf outfit, tailored in layers over the skull stage's anatomy (../_lib/bust/cloth-*.ts): a fine
// green tunic 4 mm thick whose tall standing collar hugs the neck's real outline at the seam
// (hiding the head/bust split), its top edge rolled and gold-trimmed; a wrap panel crossing the
// chest from the left shoulder, its edge rolled, stitched and trimmed gold; a teal wool cloak 8 mm
// thick over the shoulders and back, gathered thin under the collar, closed at the throat by a
// silver leaf clasp and falling open below it — its front edges rolled, gold-trimmed and worn,
// pipe folds hanging down the back and arms, tension folds pulled from the clasp.

import { type Field, hex, type IntendedCrease, type SculptEdit } from '@developerz.ai/ts23d';
import { type Fold, foldField } from '../_lib/bust/cloth-folds.ts';
import { cloth, memo, trim } from '../_lib/bust/cloth-garment.ts';
import { collarBand, type NeckSection, neckline, neckSection } from '../_lib/bust/cloth-neck.ts';
import { drag, hang, sag } from '../_lib/bust/cloth-paths.ts';
import { edgeCreases } from '../_lib/bust/creases.ts';
import type { Surface, V } from '../_lib/bust/kit.ts';
import { baseZ, bustCut, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, L, TORSO } from './spec.ts';

const BOX: [V, V] = [
  [-0.3, -0.35, 0],
  [0.3, 0.35, L.mz + 0.04],
];
const TUNIC = 0.004;
const CLOAK = 0.008;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
/** Cloth colours beside the spec's: a greener teal cloak (the spec's reads violet under the
 *  key light) and its rubbed edge. */
const K = { cloak: hex('#3f7a6a'), cloakWorn: hex('#5f7f76') };
/** The elf's trapezius rises ~5 cm over the seam toward the neck: cloth covers it up to there. */
const CAP = 0.05;
const SEAM = neckSeam(L);
/** The clasp at the throat, where the cloak closes (just under the collar). */
const CLASP: V = [L.gx - 0.12 * H, 0, SEAM.at[2] - 0.3 * (L.gx - 0.12 * H) - 0.016];

/** The neck's outline on the skin at the seam: every neckline is cut round it. */
const neckOf = (skin: Field): NeckSection => neckSection(skin, SEAM, 0.1);

/** Where the outfit declares cloth (≤ 0 inside): everything it covers but the collar's own
 *  band at the neck and the last 8 mm above the bust's base. */
export function coveredArea(skin: Field): Field {
  const gather = neckline(neckOf(skin), 0.004, 0.006, CAP);
  const floor = baseZ(TORSO) + 0.008;
  return (p) => Math.max(gather(p) + 0.01, floor - p[2]);
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  const neck = neckOf(skin.field);
  const body = memo(skin.field);
  const fine = lod < 2;
  const floor = baseZ(TORSO);
  const gather = { region: neckline(neck, 0.004, 0.006, CAP), width: 0.035 };
  const tunic = neckline(neck, 0.002, 0.004, CAP);
  const collar = collarOf(neck);
  const wrap = wrapRegion(tunic);
  return [
    cloth(
      {
        body,
        thick: TUNIC,
        region: tunic,
        floor,
        ...(fine ? { folds: foldField(tunicFolds(skin)) } : {}),
      },
      { bounds: BOX, color: C.tunic, blend: 0 },
    ),
    // The tall collar: a band standing 26 mm up the neck, its top edge rolled, filleted on.
    cloth(
      { body, thick: 0.0045, region: collar, hem: { width: 0.008, lift: 0.002, roll: 0.006 } },
      { bounds: BOX, color: C.tunic, blend: 0.01 },
    ),
    trim(collar, 0, 0.006, { bounds: BOX, color: C.trim }),
    // Wrap panel: the tunic's left front crossing over the chest to the right side.
    cloth(
      {
        body,
        thick: TUNIC + 0.002,
        region: wrap,
        floor,
        hem: { width: 0.012, lift: 0.001, roll: 0.005 },
        ...(fine ? { stitch: { at: 0.012, depth: 0.0008, width: 0.004 } } : {}),
      },
      { bounds: BOX, color: C.tunic, blend: 0.004, mirror: false },
    ),
    trim(wrap, 0, 0.008, { bounds: BOX, color: C.trim, mirror: false }),
    cloth(
      {
        body,
        thick: CLOAK,
        region: cloakRegion,
        floor,
        feather: gather,
        drape: {
          x: -0.095,
          lean: 0.3,
          top: L.mz - 0.33 * H,
          wrap: 0.8,
          halfY: 0.14,
          within: SOCLE,
        },
        hem: { width: 0.014, lift: 0.0035, roll: 0.005 },
        ...(fine ? { stitch: { at: 0.018, depth: 0.0008, width: 0.005 } } : {}),
        ...(fine ? { folds: foldField(cloakFolds(skin)) } : {}),
      },
      { bounds: BOX, color: K.cloak, blend: 0 },
    ),
    trim(cloakRegion, 0, 0.009, { bounds: BOX, color: C.trim }),
    trim(cloakRegion, -0.002, 0.002, { bounds: BOX, color: K.cloakWorn, blend: 0.003 }),
  ];
}

const collarOf = (neck: NeckSection): Field => collarBand(neck, 0.01, 0.022, 0.012);

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: the tall
 *  collar's rolled top and foot, the wrap panel's edge (left side only), the cloak's rolled
 *  edges — on both parts (the seam runs under them). */
export function outfitCreases(skin: Surface): IntendedCrease[] {
  const neck = neckOf(skin.field);
  const box: [V, V] = [
    [-0.3, -0.35, TORSO.cutZ - 0.02],
    [0.3, 0.35, L.mz],
  ];
  const edges: Array<[string, Field, string, boolean]> = [
    ['collar_band', collarOf(neck), 'the tall collar’s rolled top and its foot', true],
    [
      'tunic_neck',
      neckline(neck, 0.002, 0.004, CAP),
      'the tunic’s neckline under the collar',
      true,
    ],
    [
      'wrap_edge',
      wrapRegion(neckline(neck, 0.002, 0.004, CAP)),
      'the wrap panel’s rolled edge',
      false,
    ],
    ['cloak_hem', cloakRegion, 'the cloak’s rolled edge standing 8 mm off the tunic', true],
  ];
  return ['head', 'bust'].flatMap((part) =>
    edges.flatMap(([name, region, why, mirror]) =>
      edgeCreases(`${name}_${part}`, part, skin.field, region, box, 0.025, why, mirror),
    ),
  );
}

/** The wrap panel: the tunic left of a diagonal from the left shoulder down to the right ribs
 *  (≤ 0 inside), front only. */
function wrapRegion(tunic: Field): Field {
  const a: V = [0.06, 0.07, SEAM.at[2]];
  const b: V = [0.09, -0.07, L.mz - 0.85 * H];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const l = Math.hypot(dy, dz);
  return (p) => {
    const side = ((p[1] - a[1]) * -dz + (p[2] - a[2]) * dy) / l;
    return Math.max(tunic(p), side, 0.01 - p[0]);
  };
}

/** The cloak: over the shoulders and back, closed at the clasp and opening below it (≤ 0
 *  inside); its lower edge waves with the folds. (At the neck it thins out under the collar.) */
export const cloakRegion: Field = (p) => {
  const drop = CLASP[2] - p[2];
  const w = drop <= 0 ? -0.01 : 0.012 + drop * 1.1;
  const a = Math.atan2(p[1], -p[0]);
  const hem = L.mz - 1.0 * H + 0.005 * Math.cos(a * 9);
  return Math.max(hem - p[2], Math.min(p[0] - 0.02, w - Math.abs(p[1])));
};

/** Tunic folds: soft tension from each armpit toward the sternum. */
function tunicFolds(s: Surface): Fold[] {
  const look = { amp: 0.0025, width: 0.022, lift: TUNIC };
  const pit: V = [0.04, 0.17, L.mz - 0.72 * H];
  const to: V[] = [
    [0.09, 0.05, L.mz - 0.6 * H],
    [0.095, 0.04, L.mz - 0.78 * H],
  ];
  return drag(s, pit, to, look);
}

/** Cloak folds: pipe folds hanging down the back and over each arm from the shoulders, a U fold
 *  slung between the shoulder blades, tension folds pulled from the clasp down and out. */
function cloakFolds(s: Surface): Fold[] {
  const look = { amp: 0.0055, width: 0.02, lift: CLOAK };
  const back = [0.03, 0.09, 0.15].map((y): V => [-0.055, y, L.mz - 0.15 * H]);
  const arm = [0.14, 0.19].map((y): V => [0.025, y, L.mz - 0.22 * H]);
  const pull: V[] = [
    [0.07, 0.11, L.mz - 0.5 * H],
    [0.05, 0.16, L.mz - 0.4 * H],
  ];
  return [
    ...hang(s, back, [0.2, 0.21, 0.18], { ...look, fan: 0.2, widen: 1.5 }),
    ...hang(s, arm, [0.18, 0.18], { ...look, fan: 0.25, widen: 1.5 }),
    ...sag(s, [-0.07, 0.15, L.mz - 0.28 * H], [-0.07, -0.15, L.mz - 0.28 * H], 0.05, 2, look),
    ...drag(s, [CLASP[0], 0.012, CLASP[2]], pull, { ...look, amp: 0.0035 }),
  ];
}

/** The collar's centre line on the skin (for crease declarations). */
export function collarRing(skin: Field): V[] {
  return [...neckOf(skin).ring];
}

/** A silver leaf clasp at the throat, closing the cloak. */
export function clasp(skin: Surface): SculptEdit[] {
  const at = skin.off(CLASP, CLOAK + 0.004);
  return [
    { shape: 'ellipsoid', at, size: [0.004, 0.009, 0.016], rotate: [0, 0, 0] },
    {
      shape: 'capsule',
      at: [at[0] + 0.002, 0, at[2] - 0.014],
      to: [at[0] + 0.002, 0, at[2] + 0.014],
      size: 0.0015,
    },
  ];
}
