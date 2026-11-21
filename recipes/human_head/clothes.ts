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
// toward the hem; pinned by two brass brooches joined by a leather cord. Grime has a cause, never
// noise (../_lib/bust/cloth-grime.ts, D580): the folds' valleys, the hem, where the cord rubs.
// LOD0 sews it: a running stitch along the mantle's shoulder seams, round the darn (its own fine
// layer, its rim rolled) and along the top of the shirt's collar (D581, D582); the tunic and the
// mantle gather in short folds round the neck (D583).
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
  sculptField,
  valueNoise,
} from '@developerz.ai/ts23d';
import { type Fold, foldField } from '../_lib/bust/cloth-folds.ts';
import { type Cloth, cloth, clothField, edgeBand, memo } from '../_lib/bust/cloth-garment.ts';
import { grime, grimeZone } from '../_lib/bust/cloth-grime.ts';
import { collarBand, type NeckSection, neckline } from '../_lib/bust/cloth-neck.ts';
import { drag, hang, radiate, sag } from '../_lib/bust/cloth-paths.ts';
import { dropOnto, seamGroove, stitches, stitchLayer } from '../_lib/bust/cloth-seam.ts';
import { CLOTH_ALBEDO, LINEN, WOOL } from '../_lib/bust/cloth-strips.ts';
import { creaseCurve, edgeCreases } from '../_lib/bust/creases.ts';
import { mix } from '../_lib/bust/hair.ts';
import { neckOf } from '../_lib/bust/human/clothes.ts';
import { C, H, L } from '../_lib/bust/human/spec.ts';
import { alongZ, chain, type Surface, spline, surface, type V } from '../_lib/bust/kit.ts';
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
  thread: on(hex('#c8b890')),
};

/** One garment layer: its own sculpt on its own strip. */
export type Layer = GarmentLayer;

/** Fine jitter of an edge's wear line (never a stain on its own: the same spots at every LOD). */
const SPECK = valueNoise(createRng(0x4a02), { scale: 0.01, octaves: 2 });
/** The nearest of several wear zones (≤ 0 inside any). */
const worn =
  (...zones: Field[]): Field =>
  (p) =>
    Math.min(...zones.map((z) => z(p)));
/** Where mud starts above the bust's base, metres. */
const MUD = L.mz - 0.72 * H;

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
  const tunicFold = foldField(tunicFoldSet(skin));
  const mantleFold = foldField(mantleFolds(skin));
  // The tunic greys in its creases and along the cord that rubs it; the mantle in its valleys.
  const tunicCauses = {
    folds: tunicFold,
    spots: cord(skin).map((at) => ({ at, r: 0.007 })),
  };
  const mantleCauses = { folds: mantleFold };
  const tunicCloth: Cloth = {
    body,
    thick: TUNIC,
    region: tunic,
    floor,
    hem: { width: 0.012, lift: 0.0015, roll: 0.004 },
    ...(fine ? { stitch: { at: 0.015, depth: 0.0008, width: 0.005 } } : {}),
    ...(fine ? { folds: tunicFold } : {}),
  };
  const mantleCloth: Cloth = {
    body,
    thick: MANTLE,
    region: mantle,
    floor,
    drape: { x: -0.09, lean: 0.18, top: L.mz - 0.33 * H, wrap: 0.8, halfY: 0.13, within: SOCLE },
    hem: { width: 0.016, lift: 0.004, roll: 0.008 },
    ...(fine ? { stitch: { at: 0.022, depth: 0.0009, width: 0.006 } } : {}),
    ...(fine ? { folds: mantleFold } : {}),
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
    ],
    wear: (p) => collar(p) - 0.005,
  };
  const tunicLayer: Layer = {
    name: 'tunic',
    part: 'clothes',
    strip: WOOL,
    color: K.tunic,
    cell: [0.0102, 0.015, 0.026],
    edits: [
      cloth(tunicCloth, { bounds: BOX, color: K.tunic, blend: 0 }),
      // The wool darkened in its creases and where the cord rubs it.
      ...(fine
        ? [grime(tunicCauses, mix(K.tunic, K.tunicStain, 0.55), { bounds: BOX, fade: 0.012 })]
        : []),
    ],
    wear: grimeZone(tunicCauses, 0.012),
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
  // The darn: a square of coarser cloth sewn over a tear on the left shoulder, its rim rolled
  // under. LOD0 meshes it on a cell of its own (at the mantle's 1 cm cell the rim melted, D581).
  const darn = cloth(
    {
      body,
      thick: MANTLE + 0.003,
      region: patch,
      depth: 0.007,
      floor,
      hem: { width: 0.006, lift: 0.0016, roll: 0.0026 },
      ...(lod === 0 ? { stitch: { at: 0.0045, depth: 0.0007, width: 0.0016 } } : {}),
      ...(fine ? { folds: mantleFold } : {}),
    },
    { bounds: BOX, color: K.darn, blend: 0, mirror: false },
  );
  const mantleLayer: Layer = {
    name: 'mantle',
    part: 'mantle',
    strip: WOOL,
    color: K.mantle,
    cell: [0.0102, 0.0175, 0.026],
    edits: [
      cloth(mantleCloth, { bounds: BOX, color: K.mantle, blend: 0 }),
      ...(lod > 0 ? [darn] : []),
      // The shoulder seams: a groove from the neck to each shoulder point.
      ...(fine ? [seamGroove(shoulderLine(skin), 0.003, mix(K.mantle, K.border, 0.4))] : []),
      // The woven border: a darker band 12–30 mm in from the front edges.
      paint((p) => Math.max(edgeBand(mantleRegion, 0.012, 0.03)(p), -p[0] - 0.02), K.border, 0.003),
      // Grime in the valleys of its folds; mud and damp toward the hem, its line ragged.
      ...(fine
        ? [grime(mantleCauses, mix(K.mantle, K.mud, 0.4), { bounds: BOX, fade: 0.012 })]
        : []),
      paint((p) => p[2] - MUD + 0.012 * SPECK(p), K.mud, 0.03),
      // Wear: the front edges rubbed pale and thin, breaking inward.
      paint(
        (p) => Math.max(edgeBand(mantleRegion, -0.002, 0.008)(p), -p[0] - 0.02) + 0.003 * SPECK(p),
        K.mantleWorn,
        0.004,
      ),
    ],
    wear: worn(
      (p) => Math.max(edgeBand(mantleRegion, 0.009, 0.033)(p), -p[0] - 0.02),
      (p) => Math.max(edgeBand(mantleRegion, -0.006, 0.012)(p), -p[0] - 0.02) - 0.002,
      (p) => p[2] - MUD - 0.027,
      grimeZone(mantleCauses, 0.012),
    ),
  };
  const layers = [linenLayer, tunicLayer, braidLayer, mantleLayer];
  if (lod === 0) layers.push(...sewn(skin, linenLayer, mantleLayer, darn, collar));
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

/** LOD0's sewing, threads a millimetre thick (LOD1's cell would lose them): the darn as its own
 *  fine layer, and running stitches along the shoulder seams, round the darn and along the top of
 *  the shirt's collar, each seated on the garment as made. */
function sewn(
  skin: Surface,
  linen: Layer,
  mantle: Layer,
  darn: SculptEdit,
  collar: Field,
): Layer[] {
  const solid = (l: Layer, more: SculptEdit[] = []) =>
    sculptField([...l.edits.filter((e) => !('op' in e && e.op === 'paint')), ...more], {
      color: l.color,
      mirror: 'y',
    }).field;
  const wool = solid(mantle, [darn]);
  const shirt = surface(solid(linen));
  const top = L.mz;
  const low = L.mz - 0.6 * H;
  const rim = darnRim().flatMap(([x, y]): V[] => {
    const q = dropOnto(wool, x, y, top, low);
    return q ? [q] : [];
  });
  // The collar's top stitch: 4 mm under its rolled top, across the front where the V shows it.
  const ring = neckOf(skin.field).ring;
  const c = neckOf(skin.field).c;
  const band = ring
    .filter((p) => p[0] - c[0] > 0.6 * dmath.hypot(p[0] - c[0], p[1]))
    .map((p): V => {
      const d = dmath.hypot(p[0] - c[0], p[1]) || 1;
      return [p[0] + ((p[0] - c[0]) / d) * 0.012, p[1] + (p[1] / d) * 0.012, p[2] + 0.011];
    })
    .sort((a, b) => a[1] - b[1])
    .map((p) => shirt.on(p))
    .filter((p) => collar(p) < -0.002);
  const look = { pitch: 0.0065, length: 0.0038, r: 0.0009, color: K.thread };
  return [
    {
      name: 'darn',
      part: 'mantle',
      strip: WOOL,
      color: K.darn,
      cell: [0.0028, 0.0028, 0.0028],
      edits: [darn],
    },
    stitchLayer(
      [
        ...stitches(shoulderLine(skin, wool), { ...look, side: 0.0045 }),
        ...stitches(rim, { ...look, pitch: 0.006, mirror: false }),
        ...stitches(band, { ...look, pitch: 0.005, length: 0.003, r: 0.0007, mirror: false }),
      ],
      { strip: LINEN, color: K.thread, part: 'mantle' },
    ),
  ];
}

/** The darn's stitch row in plan (x, y): round its rounded square 4.5 mm in from the edge. */
function darnRim(): [number, number][] {
  const at = DARN;
  const [hu, hv] = [0.0205, 0.0165];
  const corners: [number, number][] = [
    [hu, hv],
    [-hu, hv],
    [-hu, -hv],
    [hu, -hv],
  ];
  const out: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = corners[Math.floor(i / 6) % 4] ?? [0, 0];
    const b = corners[(Math.floor(i / 6) + 1) % 4] ?? a;
    const t = (i % 6) / 6;
    const u = a[0] + (b[0] - a[0]) * t;
    const v = a[1] + (b[1] - a[1]) * t;
    out.push([at[0] + u * 0.94 - v * 0.34, at[1] + u * 0.34 + v * 0.94]);
  }
  return out;
}

/** The shoulder seam's line (left, mirrored): over the top of the shoulder from the mantle's
 *  neck edge out to the shoulder point, a little behind the darn; dropped onto `on` (the mantle
 *  as made) when given. */
function shoulderLine(skin: Surface, on?: Field): V[] {
  const x = L.back + 0.4 * H;
  const sh = TORSO.shoulders;
  const ctrl: V[] = [
    [x, 0.085, L.mz - 0.33 * H],
    [x, 0.5 * (0.085 + 0.92 * sh), L.mz - 0.36 * H],
    [x - 0.004, 0.92 * sh, L.mz - 0.42 * H],
  ];
  return spline(ctrl, 10).map(
    (p) => (on && dropOnto(on, p[0], p[1], L.mz, L.mz - 0.6 * H)) || skin.off(p, MANTLE),
  );
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

/** The darn's centre in plan (x, y): on the top of the left shoulder. */
const DARN: readonly [number, number] = [L.back + 0.5 * H, TORSO.shoulders * 0.62];

/** The darn: a rounded square on the top of the left shoulder (≤ 0 inside). */
function patchRegion(mantle: Field): Field {
  const at: V = [DARN[0], DARN[1], 0];
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
  // Short folds where the tunic's neckline gathers in round the neck, either side of the V.
  const ring = neckOf(s.field).ring;
  const gather = radiate(s, ring, neckOf(s.field).c, 3, 0.04, {
    amp: 0.0022,
    width: 0.009,
    lift: TUNIC,
    drop: 1.2,
    from: 0.07,
    to: 0.17,
  });
  return [
    ...drag(s, pit, to, look),
    ...hang(s, under, [0.05, 0.045], { ...look, amp: 0.0022 }),
    ...gather,
  ];
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
    // Compression folds where the mantle's collar is pulled in round the back of the neck.
    ...radiate(s, neckOf(s.field).ring, neckOf(s.field).c, 4, 0.05, {
      amp: 0.004,
      width: 0.012,
      lift: MANTLE,
      drop: 0.8,
      from: 0.3,
      to: 0.45,
    }),
  ];
}
