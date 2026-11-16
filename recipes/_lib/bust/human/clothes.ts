// Human outfit, tailored in layers over the skull stage's anatomy (../cloth-*.ts): a linen shirt
// whose band collar hugs the neck's real outline at the seam (hiding the head/bust split) and
// shows in a V; a blue wool tunic 5 mm thick, its V rolled, stitched and edged in an ochre braid,
// drag folds from each armpit, gravity folds under the chest; a red wool mantle 9 mm thick over
// the shoulders and back, gathered thin under the collar, its rolled front edges worn pale, pipe
// folds hanging from the shoulders and slung between the shoulder blades, pinned by two brass
// brooches joined by a leather cord. Each layer exists only where it can show.

import {
  type Field,
  hex,
  type IntendedCrease,
  type SculptEdit,
  sculptField,
} from '@developerz.ai/ts23d';
import { type Fold, foldField } from '../cloth-folds.ts';
import { cloth, edgeBand, memo, trim } from '../cloth-garment.ts';
import { collarBand, type NeckSection, neckline, neckSection } from '../cloth-neck.ts';
import { drag, hang, sag } from '../cloth-paths.ts';
import { creaseCurve, edgeCreases } from '../creases.ts';
import { alongZ, chain, type Surface, spline, surface, type V } from '../kit.ts';
import { baseZ, bustCut, neckSeam, torsoEdits } from '../torso.ts';
import { C, H, L, TORSO } from './spec.ts';

const BOX: [V, V] = [
  [-0.3, -0.35, 0],
  [0.3, 0.35, L.mz + 0.03],
];
const TUNIC = 0.005;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
const MANTLE = 0.009;
/** The hero's trapezius rises ~6 cm over the seam toward the neck: cloth covers it up to there. */
const CAP = 0.06;
/** Cloth colours beside the spec's: undyed linen, ochre braid, the mantle's sun- and rub-worn red. */
const K = { linen: hex('#dcd8c8'), braid: hex('#b08a3e'), mantleWorn: hex('#9a4a3c') };

/** The neck's outline on the skin at the seam: every neckline is cut round it. */
export const neckOf = (skin: Field): NeckSection => neckSection(skin, neckSeam(L), 0.1);

/** Where the outfit declares cloth (≤ 0 inside): everything it covers but the collar's own
 *  band at the neck and the last 8 mm above the bust's base. */
export function coveredArea(skin: Field): Field {
  const gather = neckline(neckOf(skin), 0.006, 0.006, CAP);
  const floor = baseZ(TORSO) + 0.008;
  return (p) => Math.max(gather(p) + 0.012, floor - p[2]);
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  const neck = neckOf(skin.field);
  const body = memo(skin.field);
  const fine = lod < 2;
  const floor = baseZ(TORSO);
  // The mantle and tunic thin out toward the neck under the collar; the tunic stops under the
  // mantle and the shirt under the tunic (a fold valley never digs down to the layer beneath).
  const gather = { region: neckline(neck, 0.006, 0.006, CAP), width: 0.055 };
  const mantleFoot = (p: V): number => Math.max(mantleRegion(p), gather.region(p));
  const tunicV = tunicRegion(neck);
  const tunic: Field = (p) => Math.max(tunicV(p), -mantleFoot(p) - 0.004);
  const shirt = neckline(neck, 0.003, 0.002, CAP);
  const braid = edgeBand(tunicV, 0, 0.011);
  return [
    cloth(
      {
        body,
        thick: 0.0028,
        region: (p) => Math.max(shirt(p), -tunicV(p) - 0.012),
        floor,
      },
      { bounds: BOX, color: K.linen, blend: 0 },
    ),
    // The shirt's band collar, 15 mm up the neck, filleted onto the skin (a band, not a ring).
    cloth(
      {
        body,
        thick: 0.0055,
        region: collarOf(neck),
        hem: { width: 0.008, lift: 0.0025, roll: 0.004 },
      },
      { bounds: BOX, color: K.linen, blend: 0.007 },
    ),
    cloth(
      {
        body,
        thick: TUNIC,
        region: tunic,
        floor,
        hem: { width: 0.012, lift: 0.0015, roll: 0.004 },
        ...(fine ? { stitch: { at: 0.015, depth: 0.0008, width: 0.005 } } : {}),
        ...(fine ? { folds: foldField(tunicFoldSet(skin)) } : {}),
      },
      { bounds: BOX, color: C.tunic, blend: 0 },
    ),
    // Braid round the V and the front of the neckline.
    { field: (p) => Math.max(braid(p), 0.035 - p[0]), bounds: BOX, op: 'paint', color: K.braid },
    cloth(
      {
        body,
        thick: MANTLE,
        region: mantleRegion,
        floor,
        feather: gather,
        drape: {
          x: -0.09,
          lean: 0.18,
          top: L.mz - 0.33 * H,
          wrap: 0.8,
          halfY: 0.15,
          within: SOCLE,
        },
        hem: { width: 0.016, lift: 0.004, roll: 0.006 },
        ...(fine ? { stitch: { at: 0.022, depth: 0.0009, width: 0.006 } } : {}),
        ...(fine ? { folds: foldField(mantleFolds(skin)) } : {}),
      },
      { bounds: BOX, color: C.mantle, blend: 0 },
    ),
    // Wear: the mantle's edges rubbed pale and thin.
    // (Only on the mantle itself: its front-edge plane runs on up the neck.)
    {
      ...trim(mantleRegion, -0.002, 0.007, { bounds: BOX, color: K.mantleWorn, blend: 0.004 }),
      field: (p) => Math.max(edgeBand(mantleRegion, -0.002, 0.007)(p), gather.region(p) + 0.01),
    },
    // Cord between the brooches, sagging across the chest.
    ...(fine ? [chain(cord(skin), 0.0032, { color: C.leather, mirror: false, blend: 0.007 })] : []),
  ];
}

const collarOf = (neck: NeckSection): Field => collarBand(neck, 0.008, 0.015, 0.014);

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: every
 *  garment edge standing off the layer under it — the tunic's V and neckline, the mantle's rolled
 *  edges, the collar's top and foot — on both parts (the seam runs under them), and the cord. */
export function outfitCreases(skin: Surface): IntendedCrease[] {
  const neck = neckOf(skin.field);
  const box: [V, V] = [
    [-0.3, -0.35, TORSO.cutZ - 0.02],
    [0.3, 0.35, L.mz],
  ];
  const edges: Array<[string, Field, string]> = [
    ['tunic_edge', tunicRegion(neck), 'the tunic’s rolled V and neckline over the shirt'],
    ['mantle_hem', mantleRegion, 'the mantle’s rolled edge standing 9 mm off the tunic'],
    ['collar_band', collarOf(neck), 'the shirt collar’s rolled top and its foot on the neck'],
  ];
  return [
    ...['head', 'bust'].flatMap((part) =>
      edges.flatMap(([name, region, why]) =>
        edgeCreases(`${name}_${part}`, part, skin.field, region, box, 0.025, why),
      ),
    ),
    ...creaseCurve('cord', 'bust', cord(skin), 0.02, 'the brooches’ cord lying on the tunic'),
  ];
}

/** Tunic: everything below the neckline but a V opening down the front (≤ 0 inside). */
function tunicRegion(neck: NeckSection): Field {
  const top = neckline(neck, 0.006, 0.004, CAP);
  const vz = neck.c[2] - 0.012;
  return (p) => {
    const depth = vz - p[2];
    const open = Math.max(
      Math.abs(p[1]) - (0.003 + depth * 0.3),
      -depth,
      depth - 0.07,
      0.02 - p[0],
    );
    return Math.max(top(p), -open);
  };
}

/** Mantle: over the shoulders and down the back, the front open and widening downward (≤ 0
 *  inside); its lower edge waves with the folds. (At the neck it thins out under the collar.) */
export const mantleRegion: Field = (p) => {
  const z0 = L.mz - 0.3 * H;
  const w = 0.118 + Math.max(0, z0 - p[2]) * 0.25;
  const a = Math.atan2(p[1], -p[0]);
  const hem = L.mz - 0.97 * H + 0.004 * Math.cos(a * 11);
  return Math.max(hem - p[2], Math.min(p[0] - (L.gx - 0.36 * H), w - Math.abs(p[1])));
};

/** The left brooch on the mantle's front edge (the right mirrors it). */
export const BROOCH: V = [L.gx - 0.1 * H, 0.122, L.mz - 0.36 * H];

function cord(s: Surface): V[] {
  const a = s.off(BROOCH, MANTLE + 0.006);
  const b = s.off([BROOCH[0], -BROOCH[1], BROOCH[2]], MANTLE + 0.006);
  return spline([a, s.off([L.gx - 0.05 * H, 0, BROOCH[2] - 0.02], TUNIC + 0.005), b], 14);
}

/** Tunic folds: tension from each armpit toward the sternum, gravity folds under the chest. */
function tunicFoldSet(s: Surface): Fold[] {
  const look = { amp: 0.003, width: 0.024, lift: TUNIC };
  const pit: V = [0.045, 0.19, L.mz - 0.72 * H];
  const to: V[] = [
    [0.1, 0.06, L.mz - 0.55 * H],
    [0.1, 0.05, L.mz - 0.72 * H],
    [0.09, 0.07, L.mz - 0.87 * H],
  ];
  const under: V[] = [
    [0.1, 0.035, L.mz - 0.78 * H],
    [0.1, 0.075, L.mz - 0.77 * H],
  ];
  return [...drag(s, pit, to, look), ...hang(s, under, [0.05, 0.045], { ...look, amp: 0.0022 })];
}

/** Mantle folds: pipe folds hanging from the front of each shoulder and down the back, U folds
 *  slung between the shoulder blades, tension folds pulled from the brooch. */
function mantleFolds(s: Surface): Fold[] {
  const look = { amp: 0.0055, width: 0.022, lift: MANTLE };
  const front = [0.15, 0.2].map((y): V => [0.035, y, L.mz - 0.18 * H]);
  const back = [0.03, 0.09, 0.15, 0.2].map((y): V => [-0.06, y, L.mz - 0.13 * H]);
  const pull: V[] = [
    [0.06, 0.2, L.mz - 0.25 * H],
    [0.07, 0.17, L.mz - 0.75 * H],
  ];
  return [
    ...hang(s, front, [0.2, 0.2], { ...look, fan: 0.25, widen: 1.5 }),
    ...hang(s, back, [0.2, 0.22, 0.21, 0.18], { ...look, fan: 0.2, widen: 1.5 }),
    ...sag(s, [-0.07, 0.17, L.mz - 0.25 * H], [-0.07, -0.17, L.mz - 0.25 * H], 0.06, 2, look),
    ...drag(s, BROOCH, pull, { ...look, amp: 0.0035 }),
  ];
}

/** Tunic fold lines (left half, on the torso), for crease declarations. */
export function tunicFolds(): V[][] {
  const body = sculptField(torsoEdits(L, TORSO), { color: C.tunic, mirror: 'y' }).field;
  return tunicFoldSet(surface(body)).map((f) => [...f.path]);
}

/** The collar's centre line on the skin (for crease declarations). */
export function collarRing(skin: Field): V[] {
  return [...neckOf(skin).ring];
}

/** The brooches pinning the mantle's front edges: a domed boss in a ring, faced along the cloth's
 *  normal, the boss filleted into the ring (one cast piece, not two parts pushed together). */
export function brooch(skin: Surface): SculptEdit[] {
  return [1, -1].flatMap((sy): SculptEdit[] => {
    const at = skin.off([BROOCH[0], BROOCH[1] * sy, BROOCH[2]], MANTLE + 0.003);
    const rotate = alongZ(skin.normal(at));
    return [
      { shape: 'torus', at, size: [0.0105, 0.003], rotate },
      { shape: 'ellipsoid', at, size: [0.008, 0.008, 0.0045], rotate, blend: 0.006 },
    ];
  });
}
