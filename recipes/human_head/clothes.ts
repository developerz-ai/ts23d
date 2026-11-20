// Human outfit, tailored in layers over the skull stage's anatomy (../_lib/bust/cloth-*.ts), each
// material its own closed solid on its own strip (`outfitLayers`): a linen shirt (`LINEN`) whose
// band collar hugs the neck's real outline at the seam (hiding the head/bust split) and shows in
// a V, grey with sweat round the collar; a blue wool tunic 5 mm thick (`WOOL`), its V rolled
// and stitched, drag folds from each armpit, gravity folds under the chest, an old stain down
// the front; an ochre braid round the V, raised and meshed fine so it never stair-steps; a red
// wool mantle 9 mm thick (its own part, on `WOOL`, no finish) over the shoulders and back, its
// neck edge rolled, a shoulder seam from the neck to each shoulder point, a woven border band
// down its front edges, those edges rubbed pale, pipe folds hanging from the shoulders and slung
// between the shoulder blades, a darned patch on the left shoulder, road dust on top and mud
// toward the hem; pinned by two brass brooches joined by a leather cord.
// `outfitEdits` is every layer in one list: the whole dressed bust as one field (hair collision,
// the cloth check). The necklines are the shared human bust's (../_lib/bust/human); the mantle is
// cut closer over the chest than its, so it reads as a mantle, not as sleeves.

import {
  createRng,
  dmath,
  type Field,
  hex,
  type IntendedCrease,
  type SculptEdit,
  valueNoise,
} from '@developerz.ai/ts23d';
import { type Fold, foldField } from '../_lib/bust/cloth-folds.ts';
import { type Cloth, cloth, clothField, edgeBand, memo } from '../_lib/bust/cloth-garment.ts';
import { collarBand, type NeckSection, neckline } from '../_lib/bust/cloth-neck.ts';
import { drag, hang, sag } from '../_lib/bust/cloth-paths.ts';
import { CLOTH_ALBEDO, LINEN, WOOL } from '../_lib/bust/cloth-strips.ts';
import { creaseCurve, edgeCreases } from '../_lib/bust/creases.ts';
import { mix } from '../_lib/bust/hair.ts';
import { neckOf } from '../_lib/bust/human/clothes.ts';
import { C, H, L } from '../_lib/bust/human/spec.ts';
import { alongZ, chain, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import type { GarmentLayer } from '../_lib/bust/layers.ts';
import { baseZ, bustCut } from '../_lib/bust/torso.ts';
import { TORSO } from './torso.ts';

const BOX: [V, V] = [
  [-0.3, -0.35, 0],
  [0.3, 0.35, L.mz + 0.03],
];
const SHIRT = 0.0028;
const TUNIC = 0.005;
const MANTLE = 0.009;
/** The braid stands this proud of the tunic, metres. */
const BRAID = 0.0024;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
/** The hero's trapezius rises ~6 cm over the seam toward the neck: cloth covers it up to there. */
const CAP = 0.06;
/** How far a layer runs on under the one above it, metres (no gap opens at a rolled edge). */
const LAP = 0.016;

/** The cloth strips' near-white ground (../_lib/bust/cloth-strips.ts): a layer's vertex colour is
 *  the tint that lands its real colour on the strip. */
const CANVAS = CLOTH_ALBEDO;
const on = (want: V): V => [
  Math.min(1, want[0] / CANVAS[0]),
  Math.min(1, want[1] / CANVAS[1]),
  Math.min(1, want[2] / CANVAS[2]),
];
/** Layer colours as tints on the cloth strips: undyed linen and its sweat-grey, the tunic's blue and its
 *  stain, the ochre braid, the mantle's madder red, its sun- and rub-worn edge, its darker woven
 *  border, a darn in undyed thread, road dust and mud. */
const K = {
  linen: on(hex('#dcd8c8')),
  linenGrime: on(hex('#9c9480')),
  tunic: on(C.tunic),
  tunicStain: on(mix(C.tunic, hex('#3a3428'), 0.55)),
  braid: on(hex('#b08a3e')),
  mantle: on(C.mantle),
  mantleWorn: on(hex('#b06a52')),
  border: on(hex('#2c1410')),
  // (Darker than the mantle: a paler patch read as a hole showing skin.)
  darn: on(hex('#5e2c22')),
  mud: on(mix(C.mantle, hex('#4a3c2c'), 0.75)),
  cord: on(C.leather),
};

/** One garment layer: its own sculpt on its own strip. */
export type Layer = GarmentLayer;

/** Wear masks: seeded world-space noise (the same spots at every LOD). */
const BLOTCH = valueNoise(createRng(0x4a01), { scale: 0.045, octaves: 3 });
const SPECK = valueNoise(createRng(0x4a02), { scale: 0.01, octaves: 2 });

/** A paint edit where `mask` < 0, fading over `blend` metres. */
const paint = (mask: Field, color: V, blend: number): SculptEdit => ({
  field: mask,
  bounds: BOX,
  op: 'paint',
  color,
  blend,
  mirror: false,
});

/** The body the outfit hides (≤ 0 = hidden): deeper than `LAP` inside the shirt's neckline. The
 *  built skin is cut there (torso.ts `bodyEdits`). */
export function hiddenBody(skin: Field): Field {
  const shirt = neckline(neckOf(skin), 0.003, 0.002, CAP);
  return (p) => shirt(p) + LAP;
}

/** Mantle: over the shoulders and down the back, its front edges 7 cm either side of the
 *  breastbone at the collar and falling apart below it in an open V (≤ 0 inside: a cloak hanging
 *  from the shoulders, where near-parallel edges read as a sleeved coat); its lower edge waves
 *  with the folds. */
export const mantleRegion: Field = (p) => {
  const z0 = L.mz - 0.3 * H;
  const w = 0.07 + Math.max(0, z0 - p[2]) * 0.5;
  const a = dmath.atan2(p[1], -p[0]);
  const hem = L.mz - 0.97 * H + 0.004 * dmath.cos(a * 11);
  return Math.max(hem - p[2], Math.min(p[0] - (L.gx - 0.36 * H), w - Math.abs(p[1])));
};

/** The left brooch on the mantle's front edge (the right mirrors it). */
export const BROOCH: V = [L.gx - 0.1 * H, 0.094, L.mz - 0.36 * H];

/** The brooches pinning the mantle's front edges: a domed boss in a ring, faced along the cloth's
 *  normal, the boss filleted into the ring (one cast piece). */
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

/** The mantle as worn (≤ 0 inside): `mantleRegion` with its neck opening, a rolled edge lying
 *  8 mm out from the tunic's neckline. */
export function mantleOf(neck: NeckSection): Field {
  const gather = neckline(neck, 0.006, 0.006, CAP);
  return (p) => Math.max(mantleRegion(p), gather(p) + 0.008);
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitLayers(skin: Surface, lod: number): Layer[] {
  const neck = neckOf(skin.field);
  const body = memo(skin.field);
  const fine = lod < 2;
  const floor = baseZ(TORSO);
  const mantle = mantleOf(neck);
  const tunicV = tunicRegion(neck);
  // Each layer exists where it can show: the tunic to a lap under the mantle, the shirt to a lap
  // under the tunic.
  const tunic: Field = (p) => Math.max(tunicV(p), -mantle(p) - LAP);
  const shirt = neckline(neck, 0.003, 0.002, CAP);
  const collar = collarOf(neck);
  const tunicCloth: Cloth = {
    body,
    thick: TUNIC,
    region: tunic,
    floor,
    hem: { width: 0.012, lift: 0.0015, roll: 0.004 },
    ...(fine ? { stitch: { at: 0.015, depth: 0.0008, width: 0.005 } } : {}),
    ...(fine ? { folds: foldField(tunicFoldSet(skin)) } : {}),
  };
  const mantleCloth: Cloth = {
    body,
    thick: MANTLE,
    region: mantle,
    floor,
    drape: { x: -0.09, lean: 0.18, top: L.mz - 0.33 * H, wrap: 0.8, halfY: 0.13, within: SOCLE },
    hem: { width: 0.016, lift: 0.004, roll: 0.008 },
    ...(fine ? { stitch: { at: 0.022, depth: 0.0009, width: 0.006 } } : {}),
    ...(fine ? { folds: foldField(mantleFolds(skin)) } : {}),
  };
  const linenLayer: Layer = {
    name: 'linen',
    part: 'clothes',
    strip: LINEN,
    color: K.linen,
    cell: [0.0096, 0.015, 0.026],
    edits: [
      cloth(
        { body, thick: SHIRT, region: (p) => Math.max(shirt(p), -tunicV(p) - LAP), floor },
        { bounds: BOX, color: K.linen, blend: 0 },
      ),
      // The shirt's band collar, 15 mm up the neck, filleted onto the skin (a band, not a ring).
      cloth(
        {
          body,
          thick: 0.0055,
          region: collar,
          hem: { width: 0.008, lift: 0.0025, roll: 0.004 },
        },
        { bounds: BOX, color: K.linen, blend: 0.007 },
      ),
      // Sweat and skin grease where the collar rubs the neck, greyer toward the nape.
      paint((p) => collar(p) + 0.002 + 0.004 * SPECK(p), K.linenGrime, 0.006),
      paint((p) => 0.014 - 0.03 * BLOTCH(p), mix(K.linen, K.linenGrime, 0.6), 0.012),
    ],
  };
  const tunicLayer: Layer = {
    name: 'tunic',
    part: 'clothes',
    strip: WOOL,
    color: K.tunic,
    cell: [0.0102, 0.015, 0.026],
    edits: [
      cloth(tunicCloth, { bounds: BOX, color: K.tunic, blend: 0 }),
      // An old spill down the front, and the cloth darkened where the cord rubs it.
      paint(
        (p) => dmath.hypot(p[1] + 0.03, (p[2] - (L.mz - 0.7 * H)) * 0.5) - 0.03 + 0.03 * BLOTCH(p),
        K.tunicStain,
        0.016,
      ),
      paint(
        (p) => 0.02 - 0.04 * BLOTCH([p[0], p[1] + 0.4, p[2]]),
        mix(K.tunic, K.tunicStain, 0.5),
        0.02,
      ),
    ],
  };
  // The braid: the tunic's own cloth, a hair thicker, on a band round the V, and only its top
  // 5.5 mm (a strip, not a wall through the body).
  const { hem: _hem, stitch: _stitch, ...tunicPlain } = tunicCloth;
  const band: Field = (p) =>
    Math.max(edgeBand(tunicV, 0, 0.011)(p), 0.035 - p[0], mantle(p) * -1 - 0.004);
  const depth = lod === 0 ? 0.0055 : 0.009;
  const braidTop = clothField({ ...tunicPlain, thick: TUNIC + 0.0015 + BRAID, region: band });
  const braidUnder = clothField({
    ...tunicPlain,
    thick: TUNIC + 0.0015 + BRAID - depth,
    region: band,
  });
  const braidLayer: Layer = {
    name: 'braid',
    part: 'clothes',
    strip: WOOL,
    color: K.braid,
    cell: [0.0048, 0.0075, 0.026],
    edits: [
      {
        field: (p) => Math.max(braidTop(p), -braidUnder(p)),
        bounds: BOX,
        color: K.braid,
        blend: 0,
      },
      // Cord between the brooches, sagging across the chest.
      ...(fine ? [chain(cord(skin), 0.0032, { color: K.cord, mirror: false, blend: 0.004 })] : []),
    ],
  };
  const patch = patchRegion(mantle);
  const mantleLayer: Layer = {
    name: 'mantle',
    part: 'mantle',
    strip: WOOL,
    color: K.mantle,
    cell: [0.0102, 0.0175, 0.026],
    edits: [
      cloth(mantleCloth, { bounds: BOX, color: K.mantle, blend: 0 }),
      // A darn on the left shoulder: a square of coarser cloth sewn over a tear.
      cloth(
        {
          body,
          thick: MANTLE + 0.003,
          region: patch,
          floor,
          hem: { width: 0.005, lift: 0.0006, roll: 0.0015 },
          ...(fine ? { folds: foldField(mantleFolds(skin)) } : {}),
        },
        { bounds: BOX, color: K.darn, blend: 0.002, mirror: false },
      ),
      // The woven border: a darker band 12–30 mm in from the front edges.
      paint((p) => Math.max(edgeBand(mantleRegion, 0.012, 0.03)(p), -p[0] - 0.02), K.border, 0.003),
      // Mud and damp toward the hem, splashed up in blotches.
      paint((p) => p[2] - (L.mz - 0.72 * H) + 0.05 * BLOTCH(p), K.mud, 0.03),
      // Wear: the front edges rubbed pale and thin, breaking inward.
      paint(
        (p) => Math.max(edgeBand(mantleRegion, -0.002, 0.008)(p), -p[0] - 0.02) + 0.003 * SPECK(p),
        K.mantleWorn,
        0.004,
      ),
    ],
  };
  const layers = [linenLayer, tunicLayer, braidLayer, mantleLayer];
  if (fine) return layers;
  // Far LOD: one sculpt of every layer (one watertight surface: separate shells 2 mm apart would
  // cross at a 2.6 cm cell), the colour blocks kept flat.
  return [
    {
      name: 'far',
      part: 'clothes',
      strip: WOOL,
      color: K.mantle,
      cell: [0.026, 0.026, 0.026],
      edits: [linenLayer, tunicLayer, mantleLayer]
        .flatMap((l) => l.edits)
        .filter((e) => !('op' in e && e.op === 'paint')),
      // Coloured by whichever garment is on top at each vertex.
      sources: [linenLayer, tunicLayer, mantleLayer],
    },
  ];
}

/** Every layer's edits in one list: the dressed bust as one field. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  return outfitLayers(skin, lod).flatMap((l) => l.edits);
}

const collarOf = (neck: NeckSection): Field => collarBand(neck, 0.008, 0.015, 0.014);

/** The parts a garment edge can crease: the garments' own parts and the skin they lie on. */
export const PARTS = ['head', 'bust', 'clothes', 'mantle'] as const;

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: every
 *  garment edge standing off the layer under it (the tunic's V and neckline, the mantle's rolled
 *  edges, the collar's top and foot, the darn), the shoulder seam and the cord. */
export function outfitCreases(skin: Surface): IntendedCrease[] {
  const neck = neckOf(skin.field);
  const box: [V, V] = [
    [-0.3, -0.35, TORSO.cutZ - 0.02],
    [0.3, 0.35, L.mz],
  ];
  const mantle = mantleOf(neck);
  const edges: Array<[string, Field, string, boolean]> = [
    ['tunic_edge', tunicRegion(neck), 'the tunic’s rolled V and neckline over the shirt', true],
    ['mantle_hem', mantle, 'the mantle’s rolled edge standing 9 mm off the tunic', true],
    ['collar_band', collarOf(neck), 'the shirt collar’s rolled top and its foot on the neck', true],
    ['darn', patchRegion(mantle), 'the darned patch’s sewn edge on the mantle', false],
  ];
  return [
    ...PARTS.flatMap((part) =>
      edges.flatMap(([name, region, why, mirror]) =>
        edgeCreases(`${name}_${part}`, part, skin.field, region, box, 0.025, why, mirror),
      ),
    ),
    ...creaseCurve('cord', 'clothes', cord(skin), 0.02, 'the brooches’ cord lying on the tunic'),
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

/** The darn: a rounded square on the top of the left shoulder (≤ 0 inside). */
function patchRegion(mantle: Field): Field {
  const at: V = [L.back + 0.5 * H, TORSO.shoulders * 0.62, 0];
  return (p) => {
    const u = Math.max(Math.abs((p[0] - at[0]) * 0.94 + (p[1] - at[1]) * 0.34) - 0.02, 0);
    const v = Math.max(Math.abs(-(p[0] - at[0]) * 0.34 + (p[1] - at[1]) * 0.94) - 0.016, 0);
    return Math.max(dmath.hypot(u, v) - 0.005, mantle(p) + 0.01, L.mz - 0.45 * H - p[2]);
  };
}

/** The cord between the brooches, sagging across the tunic. */
function cord(s: Surface): V[] {
  const a = s.off(BROOCH, MANTLE + 0.006);
  const b = s.off([BROOCH[0], -BROOCH[1], BROOCH[2]], MANTLE + 0.006);
  return spline([a, s.off([L.gx - 0.05 * H, 0, BROOCH[2] - 0.02], TUNIC + 0.005), b], 14);
}

/** Tunic folds: tension from each armpit toward the sternum, gravity folds under the chest. */
function tunicFoldSet(s: Surface): Fold[] {
  const look = { amp: 0.003, width: 0.024, lift: TUNIC };
  const pit: V = [0.045, TORSO.shoulders * 0.9, L.mz - 0.72 * H];
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
  const look = { amp: 0.0085, width: 0.02, lift: MANTLE };
  const sh = TORSO.shoulders;
  const front = [0.82 * sh, 1.05 * sh].map((y): V => [0.035, y, L.mz - 0.18 * H]);
  const back = [0.03, 0.45 * sh, 0.8 * sh, 1.05 * sh].map((y): V => [-0.06, y, L.mz - 0.13 * H]);
  const pull: V[] = [
    [0.06, 1.05 * sh, L.mz - 0.25 * H],
    [0.07, 0.9 * sh, L.mz - 0.75 * H],
  ];
  return [
    ...hang(s, front, [0.2, 0.2], { ...look, fan: 0.25, widen: 1.5 }),
    ...hang(s, back, [0.2, 0.22, 0.21, 0.18], { ...look, fan: 0.2, widen: 1.5 }),
    ...sag(
      s,
      [-0.07, 0.9 * sh, L.mz - 0.25 * H],
      [-0.07, -0.9 * sh, L.mz - 0.25 * H],
      0.06,
      2,
      look,
    ),
    ...drag(s, BROOCH, pull, { ...look, amp: 0.0035 }),
  ];
}
