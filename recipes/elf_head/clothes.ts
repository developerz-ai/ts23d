// Elf outfit, tailored in layers over the skull stage's anatomy (../_lib/bust/cloth-*.ts), each
// material its own closed solid on its own strip (`outfitLayers`): a green silk tunic 4 mm thick
// (`SILK`, no finish: its own part) with a band round the neck's real outline at the
// seam (hiding the head/bust split) and a wrap panel crossing the chest from the left shoulder;
// a teal wool cloak 8 mm thick (`WOOL`) over the shoulders and back, its neck edge rolled
// 1.4 cm out from the tunic's, closed at the throat by a silver leaf clasp and falling open below
// it, pipe folds hanging down the back and arms, its front edges rubbed pale, mud toward the
// base, road dust on the shoulders; over it a short shoulder cape of darker felt whose hem is cut
// in leaf points; and the gold braid (`brass`), raised and meshed fine so it never stair-steps:
// down the wrap's edge with a row of gold beads and down the cloak's front edges.
// `outfitEdits` is every layer in one list: the whole dressed bust as one field (hair collision,
// the cloth check).

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
import { collarBand, type NeckSection, neckline, neckSection } from '../_lib/bust/cloth-neck.ts';
import { drag, hang, sag } from '../_lib/bust/cloth-paths.ts';
import { CLOTH_ALBEDO, SILK, WOOL as WOOL_STRIP } from '../_lib/bust/cloth-strips.ts';
import { edgeCreases } from '../_lib/bust/creases.ts';
import { mix } from '../_lib/bust/hair.ts';
import type { Surface, V } from '../_lib/bust/kit.ts';
import type { GarmentLayer } from '../_lib/bust/layers.ts';
import { baseZ, bustCut, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, L, TORSO } from './spec.ts';

const BOX: [V, V] = [
  [-0.3, -0.35, 0],
  [0.3, 0.35, L.mz + 0.04],
];
const TUNIC = 0.004;
const CLOAK = 0.008;
/** The shoulder cape lies this far over the cloak, metres. */
const CAPE = 0.006;
/** The braid stands this proud of the cloth it edges, metres. */
const BRAID = 0.0024;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
/** How far a layer runs on under the one above it, metres (no gap opens at a rolled edge). */
const LAP = 0.016;
/** The elf's trapezius rises ~5 cm over the seam toward the neck: cloth covers it up to there. */
const CAP = 0.05;
const SEAM = neckSeam(L);
/** The clasp at the throat, where the cloak closes (just under the collar). */
const CLASP: V = [L.gx - 0.12 * H, 0, SEAM.at[2] - 0.3 * (L.gx - 0.12 * H) - 0.016];
/** The neck's outline on the skin at the seam: every neckline is cut round it. */
export const neckOf = (skin: Field): NeckSection => neckSection(skin, SEAM, 0.1);

/** The cloth strips' near-white ground (../_lib/bust/cloth-strips.ts): a layer's vertex colour is
 *  the tint that lands its real colour on the strip. */
const CANVAS = CLOTH_ALBEDO;
const BRASS = hex('#f5e5ae');
const on = (strip: V, want: V): V => [
  Math.min(1, want[0] / strip[0]),
  Math.min(1, want[1] / strip[1]),
  Math.min(1, want[2] / strip[2]),
];
/** A greener teal cloak (the spec's reads violet under the key light), its felt cape a shade
 *  deeper, the wool's frayed threads, road dust. */
const WOOL = {
  cloak: hex('#3f7a6a'),
  cape: hex('#1f3f3a'),
  frayed: hex('#8aa39a'),
  mud: hex('#4a4a3a'),
};
/** Layer colours as tints on their strips; `far` (LOD2: every layer in one sculpt on `canvas`)
 *  tints the silk's and the braid's colours for that strip instead. */
function tints(far: boolean) {
  return {
    tunic: on(CANVAS, C.tunic),
    tunicDark: on(CANVAS, C.tunicDark),
    cloak: on(CANVAS, WOOL.cloak),
    cape: on(CANVAS, WOOL.cape),
    frayed: on(CANVAS, WOOL.frayed),
    mud: on(CANVAS, mix(WOOL.cloak, WOOL.mud, 0.7)),
    braid: far ? on(CANVAS, C.trim) : on(BRASS, hex('#e8c878')),
    bead: far ? on(CANVAS, C.trim) : on(BRASS, hex('#f5e5ae')),
  };
}

/** One garment layer: its own sculpt on its own strip (`tunic` is the silk's part). */
export type Layer = GarmentLayer;

/** Wear masks: seeded world-space noise (the same spots at every LOD). */
const BLOTCH = valueNoise(createRng(0xe1f1), { scale: 0.04, octaves: 3 });
const SPECK = valueNoise(createRng(0xe1f2), { scale: 0.009, octaves: 2 });

/** A paint edit where `mask` < 0, fading over `blend` metres. */
const paint = (mask: Field, color: V, blend: number): SculptEdit => ({
  field: mask,
  bounds: BOX,
  op: 'paint',
  color,
  blend,
  mirror: false,
});

/** Where the outfit declares cloth (≤ 0 inside): everything it covers but the collar's own
 *  band at the neck and the last 8 mm above the bust's base. */
export function coveredArea(skin: Field): Field {
  const gather = neckline(neckOf(skin), 0.004, 0.006, CAP);
  const floor = baseZ(TORSO) + 0.008;
  return (p) => Math.max(gather(p) + 0.01, floor - p[2]);
}

/** The body the outfit hides (≤ 0 = hidden): deeper than `LAP` inside the tunic's neckline. The
 *  built skin is cut there (torso.ts `bodyEdits`). */
export function hiddenBody(skin: Field): Field {
  const tunic = neckline(neckOf(skin), 0.002, 0.004, CAP);
  return (p) => tunic(p) + LAP;
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitLayers(skin: Surface, lod: number): Layer[] {
  const neck = neckOf(skin.field);
  const body = memo(skin.field);
  const fine = lod < 2;
  const K = tints(!fine);
  const floor = baseZ(TORSO);
  const tunicAll = neckline(neck, 0.002, 0.004, CAP);
  // The tunic exists where it can show: in the cloak's opening, and a lap under its edges.
  const shows: Field = (p) => -cloak(p) - LAP;
  const tunic: Field = (p) => Math.max(tunicAll(p), shows(p));
  const collar = collarOf(neck);
  // (The wrap, like the tunic, only where it can show.)
  const wrapAll = wrapRegion(tunicAll);
  const wrap: Field = (p) => Math.max(wrapAll(p), shows(p));
  const wrapCloth: Cloth = {
    body,
    thick: TUNIC + 0.002,
    region: wrap,
    floor,
    hem: { width: 0.012, lift: 0.001, roll: 0.005 },
    ...(fine ? { stitch: { at: 0.012, depth: 0.0008, width: 0.004 } } : {}),
  };
  const collarCloth: Cloth = {
    body,
    thick: 0.0045,
    region: collar,
    hem: { width: 0.008, lift: 0.002, roll: 0.006 },
  };
  const cloakFold = fine ? { folds: foldField(cloakFolds(skin)) } : {};
  const cloak = cloakOf(neck);
  const cloakCloth: Cloth = {
    body,
    thick: CLOAK,
    region: cloak,
    floor,
    drape: { x: -0.095, lean: 0.3, top: L.mz - 0.33 * H, wrap: 0.8, halfY: 0.14, within: SOCLE },
    hem: { width: 0.014, lift: 0.0035, roll: 0.008 },
    ...(fine ? { stitch: { at: 0.018, depth: 0.0008, width: 0.005 } } : {}),
    ...cloakFold,
  };
  const cape = capeRegion(neck);
  // (The cloak's own cloth, a layer thicker: it follows the cloak's folds and its drape.)
  const { stitch: _s0, ...cloakBase } = cloakCloth;
  const capeCloth: Cloth = {
    ...cloakBase,
    thick: CLOAK + CAPE,
    region: cape,
    hem: { width: 0.01, lift: 0.002, roll: 0.004 },
  };
  const tunicLayer: Layer = {
    name: 'tunic',
    part: 'tunic',
    strip: SILK,
    color: K.tunic,
    cell: [0.009, 0.015, 0.026],
    edits: [
      cloth(
        {
          body,
          thick: TUNIC,
          region: tunic,
          floor,
          ...(fine ? { folds: foldField(tunicFolds(skin)) } : {}),
        },
        { bounds: BOX, color: K.tunic, blend: 0 },
      ),
      // The tall collar: a band standing 26 mm up the neck, its top edge rolled, filleted on.
      cloth(collarCloth, { bounds: BOX, color: K.tunic, blend: 0.01 }),
      // Wrap panel: the tunic's left front crossing over the chest to the right side.
      cloth(wrapCloth, { bounds: BOX, color: K.tunic, blend: 0.004, mirror: false }),
      // Silk darkens where it is handled: inside the collar and along the wrap's fold.
      paint((p) => collar(p) + 0.004 + 0.004 * SPECK(p), K.tunicDark, 0.006),
      paint((p) => 0.02 - 0.04 * BLOTCH(p), mix(K.tunic, K.tunicDark, 0.5), 0.02),
    ],
  };
  const cloakLayer: Layer = {
    name: 'cloak',
    part: 'clothes',
    strip: WOOL_STRIP,
    color: K.cloak,
    cell: [0.0089, 0.0137, 0.026],
    edits: [
      cloth(cloakCloth, { bounds: BOX, color: K.cloak, blend: 0 }),
      cloth(capeCloth, { bounds: BOX, color: K.cape, blend: 0.002 }),
      // The hem: trodden and frayed, pale broken threads above a band of old mud.
      paint((p) => p[2] - HEM - 0.03 + 0.014 * BLOTCH(p), K.mud, 0.02),
      paint((p) => p[2] - HEM - 0.012 + 0.008 * SPECK(p), K.frayed, 0.006),
      // The front edges rubbed pale by the hands that draw the cloak closed.
      paint(
        (p) => edgeBand(cloakRegion, 0.009, 0.02)(p) + 0.004 + 0.012 * SPECK(p),
        K.frayed,
        0.006,
      ),
    ],
  };
  // The braid: the same cloth as what it edges, a hair thicker, on a band along the edge, and
  // only its top 5.5 mm (LOD1: 9 mm, over a cell) (a strip, not a wall through the body).
  const depth = lod === 0 ? 0.0055 : 0.009;
  const braid = (c: Cloth, band: Field, lift: number, mirror?: boolean): SculptEdit => {
    const { hem: _hem, stitch: _stitch, ...plain } = c;
    const top = clothField({ ...plain, thick: c.thick + lift + BRAID, region: band });
    const under = clothField({ ...plain, thick: c.thick + lift + BRAID - depth, region: band });
    return {
      field: (p) => Math.max(top(p), -under(p)),
      bounds: BOX,
      color: K.braid,
      blend: 0,
      ...(mirror === undefined ? {} : { mirror }),
    };
  };
  const braidLayer: Layer = {
    name: 'braid',
    part: 'clothes',
    strip: 'brass',
    color: K.braid,
    cell: [0.0048, 0.0075, 0.026],
    edits: [
      braid(
        wrapCloth,
        (p) =>
          Math.max(
            edgeBand(wrapAll, 0, 0.008)(p),
            tunicAll(p) + 0.012,
            0.03 - p[0],
            -cloakRegion(p),
          ),
        0.001,
        false,
      ),
      // (Down the cloak's front edges only: its hem is frayed, not braided.)
      braid(
        cloakBase,
        (p) =>
          Math.max(edgeBand(cloakRegion, 0, 0.009)(p), HEM + 0.02 - p[2], -p[0] - 0.01, cloak(p)),
        0.0035,
      ),
      // Gold beads down the wrap's edge, a finger apart.
      ...(fine ? beads(skin, wrapAll, K.bead) : []),
    ],
  };
  const layers = [tunicLayer, cloakLayer, braidLayer];
  if (fine) return layers;
  // Far LOD: one sculpt of every layer (one watertight surface: separate shells 2 mm apart would
  // cross at a 2.6 cm cell), the colour blocks kept flat.
  return [
    {
      name: 'far',
      part: 'clothes',
      strip: 'canvas',
      color: K.cloak,
      cell: [0.026, 0.026, 0.026],
      edits: [tunicLayer, cloakLayer]
        .flatMap((l) => l.edits)
        .filter((e) => !('op' in e && e.op === 'paint')),
    },
  ];
}

/** The cloak's own outer surface (it hangs clear of the lower back): what the cape's hem and the
 *  braid lie on, for crease declarations. */
export function cloakSurface(skin: Surface): Field {
  const cloak = outfitLayers(skin, 1).find((l) => l.name === 'cloak');
  const first = cloak?.edits[0];
  return first && 'field' in first && first.field ? first.field : skin.field;
}

/** Every layer's edits in one list: the dressed bust as one field. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  return outfitLayers(skin, lod).flatMap((l) => l.edits);
}

const collarOf = (neck: NeckSection): Field => collarBand(neck, 0.01, 0.022, 0.012);

/** The parts a garment edge can crease: the garments' own parts and the skin they lie on. */
export const PARTS = ['head', 'bust', 'tunic', 'clothes'] as const;

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: the tall
 *  collar's rolled top and foot, the wrap panel's edge (left side only), the cloak's and the
 *  cape's rolled edges, on the garments' parts and the skin parts the seam runs under. */
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
    ['cloak_hem', cloakOf(neck), 'the cloak’s rolled edge standing 8 mm off the tunic', true],
    ['cape_hem', capeRegion(neck), 'the shoulder cape’s leaf-cut hem on the cloak', true],
  ];
  return PARTS.flatMap((part) =>
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
  const l = dmath.hypot(dy, dz);
  return (p) => {
    const side = ((p[1] - a[1]) * -dz + (p[2] - a[2]) * dy) / l;
    return Math.max(tunic(p), side, 0.01 - p[0]);
  };
}

/** The cloak's hem height: it waves with the folds. */
const HEM = L.mz - 1.0 * H;

/** The cloak: over the shoulders and back, closed at the clasp and opening below it (≤ 0
 *  inside); its lower edge waves with the folds and is frayed (a ragged line, not a cut one).
 *  (At the neck it thins out under the collar.) */
export const cloakRegion: Field = (p) => {
  const drop = CLASP[2] - p[2];
  const w = drop <= 0 ? -0.01 : 0.012 + drop * 1.1;
  const a = dmath.atan2(p[1], -p[0]);
  const hem = HEM + 0.005 * dmath.cos(a * 9) + 0.004 * SPECK([p[0], p[1], 0]);
  return Math.max(hem - p[2], Math.min(p[0] - 0.02, w - Math.abs(p[1])));
};

/** The cloak as worn (≤ 0 inside): `cloakRegion` with its neck opening, a rolled edge lying
 *  1.4 cm out from the tunic's neckline, so the silk shows as a band between skin and wool. */
export function cloakOf(neck: NeckSection): Field {
  const gather = neckline(neck, 0.004, 0.006, CAP);
  return (p) => Math.max(cloakRegion(p), gather(p) + 0.014);
}

/** The shoulder cape (≤ 0 inside): the cloak's upper part out to 14.5–19 cm from the neck's
 *  axis in plan, its hem cut in eleven leaf points; open at the front like the cloak. */
export function capeRegion(neck: NeckSection): Field {
  const cx = neck.c[0];
  const cloak = cloakOf(neck);
  return (p) => {
    const a = dmath.atan2(p[1], p[0] - cx);
    // A leaf point: a rounded lobe with a tip (|cos| sharpened).
    const lobe = 1 - dmath.pow(Math.abs(dmath.cos(a * 5.5)), 0.7);
    const reach = 0.145 + 0.045 * lobe;
    const plan = (dmath.hypot(p[0] - cx, p[1]) - reach) * 0.7;
    return Math.max(cloak(p), plan, SEAM.at[2] - 0.14 - p[2]);
  };
}

/** Gold beads on the wrap's edge braid: one every 2.2 cm down the diagonal. */
function beads(skin: Surface, wrap: Field, color: V): SculptEdit[] {
  const out: SculptEdit[] = [];
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    // March from the wrap's inside (the right) toward its edge at this height.
    const z = SEAM.at[2] - 0.02 - t * (SEAM.at[2] - 0.02 - (L.mz - 0.8 * H));
    let y = -0.1;
    while (y < 0.09 && wrap(skin.on([0.1, y, z])) < -0.004) y += 0.002;
    const at = skin.off([0.1, y, z], TUNIC + 0.002 + BRAID + 0.0015);
    // (Only where the cloak's opening shows the edge.)
    if (cloakRegion(at) < 0.004) continue;
    out.push({ shape: 'sphere', at, size: 0.0032, color, mirror: false });
  }
  return out;
}

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
  const sh = TORSO.shoulders;
  const back = [0.03, 0.5 * sh, 0.85 * sh].map((y): V => [-0.055, y, L.mz - 0.15 * H]);
  const arm = [0.8 * sh, 1.08 * sh].map((y): V => [0.025, y, L.mz - 0.22 * H]);
  const pull: V[] = [
    [0.07, 0.11, L.mz - 0.5 * H],
    [0.05, 0.9 * sh, L.mz - 0.4 * H],
  ];
  return [
    ...hang(s, back, [0.2, 0.21, 0.18], { ...look, fan: 0.2, widen: 1.5 }),
    ...hang(s, arm, [0.18, 0.18], { ...look, fan: 0.25, widen: 1.5 }),
    ...sag(
      s,
      [-0.07, 0.85 * sh, L.mz - 0.28 * H],
      [-0.07, -0.85 * sh, L.mz - 0.28 * H],
      0.05,
      2,
      look,
    ),
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
