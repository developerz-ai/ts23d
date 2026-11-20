// Goblin outfit, tailored in layers over the skull stage's anatomy (../_lib/bust/cloth-*.ts), each
// layer its own closed solid on its own material strip (`outfitLayers`): a rumpled linen shirt
// (`LINEN`) whose sleeves come out of the vest's armholes, creased in zigzags where it bunches
// in the vest's opening, grimy down the placket and at the neck; a sleeveless leather vest
// (`leather`) 9 mm thick, its rolled edges stitched and rubbed pale, a shoulder seam, sweat-dark
// under the arms, a newer patch sewn on the chest and one on the back, closed by a horn toggle
// on a thong; a wool hood worn down as a thick roll on the back of the neck, dusty on top; a
// red scarf folded flat in two wraps round the neck seam (hiding the head/bust split), knotted
// at the front left, its two ragged tails faded and muddy at the ends.
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
import { cloth, edgeBand, memo, trim } from '../_lib/bust/cloth-garment.ts';
import { neckline, neckSection } from '../_lib/bust/cloth-neck.ts';
import { drag, sag, zigzag } from '../_lib/bust/cloth-paths.ts';
import { CLOTH_ALBEDO, LINEN, WOOL } from '../_lib/bust/cloth-strips.ts';
import { edgeCreases, ringCreases } from '../_lib/bust/creases.ts';
import { lock, mix } from '../_lib/bust/hair.ts';
import { chain, cone2, crease, type Surface, spline, type V } from '../_lib/bust/kit.ts';
import type { GarmentLayer } from '../_lib/bust/layers.ts';
import { baseZ, bustCut, neckSeam } from '../_lib/bust/torso.ts';
import { C, H, LT as L, TORSO } from './spec.ts';

const BOX: [V, V] = [
  [-0.3, -0.3, 0],
  [0.3, 0.3, L.mz + 0.02],
];
const SHIRT = 0.0025;
/** Thick stiff hide: its cut edge stands a centimetre off the shirt. */
const VEST = 0.009;
const SEAM = neckSeam(L);
/** The goblin's trapezius rises ~4 cm over the seam; above the seam cloth stays behind the jaw
 *  (`behindJaw`). */
const CAP = 0.04;
/** The bust's socle cut (torso.ts): a drape narrows into it like the body. */
const SOCLE = bustCut(baseZ(TORSO), 0.3 * H, 0.26 * H);
/** The vest's back panel: stiff leather hanging straight off the shoulder blades. */
export const BACK = { x: -0.072, lean: 0.25, wrap: 1.2, halfY: 0.08 };
/** How far a layer runs on under the one above it, metres (no gap opens at a rolled edge). */
const LAP = 0.014;

/** The strips' own albedo (src/material/library.ts): a layer's vertex colour is the tint that
 *  lands its real colour on the strip. */
const CANVAS = CLOTH_ALBEDO;
const LEATHER = hex('#7c5438');
const on = (strip: V, want: V): V => [
  Math.min(1, want[0] / strip[0]),
  Math.min(1, want[1] / strip[1]),
  Math.min(1, want[2] / strip[2]),
];
/** Layer colours as tints on their strips; `far` (LOD2: every layer in one sculpt on the wool
 *  strip, whose ground is the cloth albedo) tints the leather's colours for that strip instead. */
function tints(far: boolean) {
  const hide = far ? CANVAS : LEATHER;
  return {
    shirt: on(CANVAS, C.shirt),
    shirtGrime: on(CANVAS, C.grime),
    vest: on(hide, C.vest),
    vestWorn: on(hide, hex('#9a7450')),
    vestSweat: on(hide, C.vestSweat),
    patch: on(hide, C.patch),
    thread: on(hide, C.thread),
    hood: on(CANVAS, C.hood),
    hoodDust: on(CANVAS, mix(C.hood, C.dust, 0.35)),
    scarf: on(CANVAS, C.scarf),
    scarfFaded: on(CANVAS, C.scarfFaded),
    scarfMud: on(CANVAS, C.scarfMud),
  };
}
type Tints = ReturnType<typeof tints>;

/** One garment layer: its own sculpt on its own strip. */
export type Layer = GarmentLayer;

/** Stain and wear masks: seeded world-space noise (the same spots at every LOD). */
const BLOTCH = valueNoise(createRng(0x60b1), { scale: 0.035, octaves: 3 });
const SPECK = valueNoise(createRng(0x60b2), { scale: 0.012, octaves: 2 });

/** A paint edit where `mask` < 0, fading over `blend` metres. */
const paint = (mask: Field, color: V, blend: number): SculptEdit => ({
  field: mask,
  bounds: BOX,
  op: 'paint',
  color,
  blend,
  mirror: false,
});

/** Where the outfit declares cloth (≤ 0 inside): everything it covers but the scarf's band at
 *  the neck and the last 8 mm above the bust's base. */
export function coveredArea(skin: Field): Field {
  const gather = behindJaw(neckline(neckSection(skin, SEAM, 0.07), 0.004, 0.005, CAP));
  const floor = baseZ(TORSO) + 0.008;
  return (p) => Math.max(gather(p) + 0.01, floor - p[2]);
}

/** The body the outfit hides (≤ 0 = hidden): deeper than `LAP` inside the shirt's neckline. The
 *  built skin is cut there (torso.ts `bodyEdits`). */
export function hiddenBody(skin: Field): Field {
  const shirt = behindJaw(neckline(neckSection(skin, SEAM, 0.07), 0.002, 0.003, CAP));
  return (p) => shirt(p) + LAP;
}

/** `skin` is the stage-2 anatomy (skull stage + torso): every layer lies on it. */
export function outfitLayers(skin: Surface, lod: number): Layer[] {
  const neck = neckSection(skin.field, SEAM, 0.07);
  const body = memo(skin.field);
  const fine = lod < 2;
  const K = tints(!fine);
  const floor = baseZ(TORSO);
  const gather = { region: behindJaw(neckline(neck, 0.004, 0.005, CAP)), width: 0.03 };
  const shirtAll = behindJaw(neckline(neck, 0.002, 0.003, CAP));
  // The shirt exists where it can show: in the vest's opening and armholes, and a lap under it.
  const shirt: Field = (p) => Math.max(shirtAll(p), -vestRegion(p) - LAP);
  const shirtLayer: Layer = {
    name: 'shirt',
    part: 'clothes',
    strip: LINEN,
    color: K.shirt,
    cell: [0.0102, 0.015, 0.03],
    edits: [
      cloth(
        {
          body,
          thick: SHIRT,
          region: shirt,
          floor,
          // Gathered under the scarf: an abrupt shirt edge here splits the head from the bust.
          feather: gather,
          ...(fine ? { folds: foldField([...shirtFolds(skin), ...sleeveFolds(skin)]) } : {}),
        },
        { bounds: BOX, color: K.shirt, blend: 0 },
      ),
      // Grime: the linen darkened down the placket where it is handled, round the neck where it
      // rubs the skin, and in blotches (old stains) everywhere.
      trim(vestRegion, -0.03, -0.004, { bounds: BOX, color: K.shirtGrime, blend: 0.012 }),
      paint((p) => -gather.region(p) - 0.03 + 0.01 * SPECK(p), K.shirtGrime, 0.02),
      paint((p) => 0.012 - 0.03 * BLOTCH(p), mix(K.shirt, K.shirtGrime, 0.7), 0.012),
    ],
  };
  const vestLayer: Layer = {
    name: 'vest',
    part: 'clothes',
    strip: 'leather',
    color: K.vest,
    cell: [0.0074, 0.0137, 0.03],
    edits: [
      cloth(
        {
          body,
          thick: VEST,
          region: vestRegion,
          floor,
          feather: gather,
          // Stiff leather: it hangs straight off the shoulder blades, not into the small of the back.
          drape: { ...BACK, top: SEAM.at[2], within: SOCLE },
          hem: { width: 0.014, lift: 0.003, roll: 0.008 },
          ...(fine ? { stitch: { at: 0.011, depth: 0.0008, width: 0.0035 } } : {}),
          ...(fine ? { folds: foldField(vestFolds(skin)) } : {}),
        },
        { bounds: BOX, color: K.vest, blend: 0 },
      ),
      // Patches: newer leather sewn over a tear on the left chest and the right shoulder blade.
      ...PATCHES.flatMap((patch) => [
        cloth(
          {
            body,
            thick: VEST + 0.0028,
            region: patch,
            floor,
            hem: { width: 0.005, lift: 0.0006, roll: 0.0015 },
          },
          { bounds: BOX, color: K.patch, blend: 0.0015, mirror: false },
        ),
        // Its waxed thread, a line 3–5 mm in from the edge.
        ...(fine ? [paint((p) => Math.abs(-patch(p) - 0.004) - 0.0012, K.thread, 0.0015)] : []),
      ]),
      // The shoulder seam: a groove from the neck to the armhole, its thread pale.
      ...(fine ? shoulderSeam(skin, K) : []),
      // Sweat and handling: dark under the arms and down the back's middle, blotched.
      paint((p) => -armhole(p) - 0.018 + 0.012 * BLOTCH(p), mix(K.vest, K.vestSweat, 0.6), 0.02),
      paint(
        (p) => Math.max(p[0] + 0.02, Math.abs(p[1]) - 0.035) + 0.02 * BLOTCH(p),
        mix(K.vest, K.vestSweat, 0.45),
        0.03,
      ),
      paint(
        (p) => 0.016 - 0.03 * BLOTCH([p[0] + 0.3, p[1], p[2]]),
        mix(K.vest, K.vestSweat, 0.5),
        0.014,
      ),
      // Edges rubbed pale: the rolled hem, and scuffs breaking inward from it.
      trim(vestRegion, -0.001, 0.004, { bounds: BOX, color: K.vestWorn, blend: 0.003 }),
      paint((p) => edgeBand(vestRegion, 0, 0.02)(p) + 0.012 + 0.03 * SPECK(p), K.vestWorn, 0.006),
    ],
  };
  const hoodLayer: Layer = {
    name: 'hood',
    part: 'clothes',
    strip: WOOL,
    color: K.hood,
    cell: [0.0096, 0.0163, 0.026],
    edits: [
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
        { bounds: BOX, color: K.hood, blend: 0.012 },
      ),
      // Road dust settled on the roll's top, thinner in the folds.
      paint((p) => 0.02 - SEAM.field(p) + 0.012 * SPECK(p), K.hoodDust, 0.014),
    ],
  };
  const scarfLayer: Layer = {
    name: 'scarf',
    part: 'clothes',
    strip: WOOL,
    color: K.scarf,
    cell: [0.006, 0.01, 0.02],
    edits: scarfEdits(skin, fine, K),
  };
  const layers = [shirtLayer, vestLayer, hoodLayer, scarfLayer];
  if (fine) return layers;
  // Far LOD: one sculpt of every layer (one watertight surface: separate shells 3 mm apart would
  // cross at a 2.6 cm cell), the colour blocks kept flat (stains a cell wide read as camouflage).
  return [
    {
      name: 'far',
      part: 'clothes',
      strip: WOOL,
      color: K.shirt,
      cell: [0.026, 0.026, 0.026],
      edits: layers.flatMap((l) => l.edits).filter((e) => !('op' in e && e.op === 'paint')),
      // Coloured by whichever garment is on top at each vertex (shirt, vest, hood, scarf).
      sources: layers,
    },
  ];
}

/** Every layer's edits in one list: the dressed bust as one field. */
export function outfitEdits(_torso: Field, skin: Surface, lod: number): SculptEdit[] {
  return outfitLayers(skin, lod).flatMap((l) => l.edits);
}

/** The hard fittings (bone, on the plain strip): a horn toggle on the vest's left edge, caught by
 *  a thong from the right. */
export function toggleEdits(skin: Surface): SculptEdit[] {
  const line = toggleLine(skin);
  const a = line[line.length - 1] ?? SEAM.at;
  return [
    cone2([a[0], a[1], a[2] + 0.014], [a[0], a[1], a[2] - 0.014], 0.0035, 0.005, {
      color: C.horn,
      mirror: false,
    }),
    chain(line, 0.003, { color: C.vestDark, mirror: false, blend: 0.002 }),
  ];
}

/** The thong's line: from the vest's right edge across the shirt to the toggle on the left. */
export function toggleLine(skin: Surface): V[] {
  const z = L.mz - 0.62 * H;
  const w = 0.02 + (SEAM.at[2] - z) * 0.25;
  const a = skin.off([L.gx - 0.1 * H, w + 0.012, z], VEST + 0.006);
  const b = skin.off([L.gx - 0.1 * H, -w - 0.012, z - 0.004], VEST + 0.003);
  const mid = skin.off([L.gx - 0.1 * H, 0, z - 0.002], SHIRT + 0.007);
  return spline([b, mid, a], 8);
}

/** A region kept below the seam, behind x = 2 cm, under the jaw only (the hunched goblin's jaw
 *  hangs low, in front of the neck, inside the shoulders' cap); beyond the jaw's half-width the
 *  shoulder fronts stay covered (they showed bare skin, D61). */
const behindJaw =
  (f: Field): Field =>
  (p) =>
    Math.max(f(p), Math.min(SEAM.field(p), p[0] - 0.02, JAW - Math.abs(p[1])));
/** Half-width of the hanging jaw, metres. */
const JAW = 0.05;

/** The arm's axis under the shoulder point (left side): the armhole is cut round it. */
const ARM: readonly [V, V] = [
  [L.back + 0.45 * H, TORSO.shoulders + 0.02, L.mz - 0.5 * H],
  [L.back + 0.44 * H, TORSO.shoulders + 0.03, L.mz - 1.1 * H],
];
/** The vest's armhole (> 0 inside the hole, both sides): 4.6 cm round the arm's axis at the
 *  shoulder point, opening to 8 cm at the bust's cut (no sliver of side panel under the arm). */
const armhole: Field = (p) => {
  const [a, b] = ARM;
  const q: V = [p[0], Math.abs(p[1]), p[2]];
  const ab: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = Math.min(
    1,
    Math.max(0, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1] + (q[2] - a[2]) * ab[2]) / l2),
  );
  const d = dmath.hypot(q[0] - a[0] - ab[0] * t, q[1] - a[1] - ab[1] * t, q[2] - a[2] - ab[2] * t);
  return (0.046 + 0.034 * t - d) * 0.95;
};

/** Vest: sleeveless, over the shoulders and back, open down the front in a V that widens
 *  downward (≤ 0 inside). (At the neck it thins out under the scarf.) */
export const vestRegion: Field = (p) => {
  const drop = SEAM.at[2] - p[2];
  const opening = 0.02 + Math.max(drop, 0) * 0.25 - Math.abs(p[1]);
  const front = p[0] - (L.gx - 0.3 * H);
  return Math.max(-Math.max(-opening, -front), armhole(p));
};

/** A patch: a rounded rectangle `half` (y, z) about `at`, turned `deg` about X, on the side of
 *  the body `at` lies on (≤ 0 inside). */
function patchRegion(at: V, half: readonly [number, number], deg: number): Field {
  const c = dmath.cos((deg * Math.PI) / 180);
  const s = dmath.sin((deg * Math.PI) / 180);
  const side = Math.sign(at[0]) || 1;
  return (p) => {
    const y = p[1] - at[1];
    const z = p[2] - at[2];
    const u = Math.max(Math.abs(y * c + z * s) - half[0], 0);
    const v = Math.max(Math.abs(-y * s + z * c) - half[1], 0);
    return Math.max(dmath.hypot(u, v) - 0.004, -(p[0] - at[0]) * side - 0.03);
  };
}
const PATCHES: readonly Field[] = [
  patchRegion([0.03, 0.062, L.mz - 0.66 * H], [0.012, 0.016], 12),
  patchRegion([-0.05, -0.05, L.mz - 0.62 * H], [0.018, 0.014], -20),
];

/** The shoulder seam (left, mirrored): a groove over the strap from the neck to the armhole and
 *  its pale thread. */
function shoulderSeam(skin: Surface, K: Tints): SculptEdit[] {
  const x = L.back + 0.43 * H;
  const z = SEAM.at[2] + 0.02;
  const line = spline(
    [
      [x, 0.034, z],
      [x, 0.05, z],
      [x, 0.066, z - 0.004],
    ],
    6,
  ).map((p) => skin.off(p, VEST + 0.0008));
  return [crease(line, 0.0024, { blend: 0.0015, color: K.vestSweat })];
}

/** The outfit's intended creases (QA `connections`), from the geometry that tailors it: the
 *  vest's and hood's rolled edges on the layer beneath, and the scarf where it wraps the neck's
 *  root, on the `clothes` part and on the skin parts the seam runs under. */
export function outfitCreases(skin: Surface): IntendedCrease[] {
  const box: [V, V] = [
    [-0.3, -0.3, TORSO.cutZ - 0.02],
    [0.3, 0.3, L.mz],
  ];
  const ring = scarfRing(skin.field);
  const shirt = behindJaw(neckline(neckSection(skin.field, SEAM, 0.07), 0.002, 0.003, CAP));
  return PARTS.flatMap((part) => [
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

/** The parts a garment edge can crease: the garments' own part and the skin it lies on. */
export const PARTS = ['head', 'bust', 'clothes'] as const;

/** The hood worn down: a band behind the neck either side of the seam, bunched within 9 cm of
 *  the neck's axis (≤ 0 inside). */
export const hoodRegion: Field = (p) =>
  Math.max(
    p[0] - (SEAM.at[0] - 0.02),
    SEAM.field(p) - 0.03,
    -SEAM.field(p) - 0.015,
    dmath.hypot(p[0] - SEAM.at[0], p[1]) - 0.09,
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

/** Sleeve folds: the linen pulled from the shoulder point down and round the arm. */
function sleeveFolds(s: Surface): Fold[] {
  const top: V = [ARM[0][0], TORSO.shoulders + 0.01, ARM[0][2] + 0.03];
  const to: V[] = [
    [ARM[0][0] + 0.03, TORSO.shoulders + 0.03, L.mz - 0.85 * H],
    [ARM[0][0], TORSO.shoulders + 0.045, L.mz - 0.8 * H],
    [ARM[0][0] - 0.03, TORSO.shoulders + 0.03, L.mz - 0.85 * H],
  ];
  return drag(s, top, to, { amp: 0.004, width: 0.013, lift: SHIRT });
}

/** Vest folds: tension from each armpit toward the opening. */
function vestFolds(s: Surface): Fold[] {
  // (From inside the panel, clear of the armhole's rolled edge.)
  const pit: V = [0.025, 0.06, L.mz - 0.74 * H];
  const to: V[] = [
    [L.gx - 0.1 * H, 0.04, L.mz - 0.6 * H],
    [L.gx - 0.1 * H, 0.045, L.mz - 0.88 * H],
  ];
  return drag(s, pit, to, { amp: 0.002, width: 0.014, lift: VEST });
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
    const x = n.c[0] + r * dmath.cos(a);
    const y = r * dmath.sin(a);
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

/** The scarf: a band folded flat in two wraps (the upper one tighter to the neck, a fold line
 *  between them), sun-faded on the outer fold; a flat knot at the front left; two ragged tails
 *  (strands of unequal length) muddy at the ends. */
function scarfEdits(skin: Surface, fine: boolean, K: Tints): SculptEdit[] {
  const ring = scarfRing(skin.field);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const wrap = (out: number, dz: number): V[] => {
    const pts = ring.map((p): V => {
      const r = dmath.hypot(p[0] - cx, p[1]) || 1;
      return [p[0] + ((p[0] - cx) / r) * out, p[1] + (p[1] / r) * out, p[2] + dz];
    });
    return [...pts, pts[0] ?? SEAM.at];
  };
  // The far LOD keeps one fat band (thin wraps fold at its coarse cell).
  const out: SculptEdit[] = fine
    ? [
        chain(wrap(0.004, -0.01), 0.0068, { color: K.scarf, mirror: false }),
        chain(wrap(0.0025, 0), 0.0066, { color: K.scarfFaded, mirror: false, blend: 0.004 }),
        chain(wrap(0, 0.0095), 0.006, { color: K.scarf, mirror: false, blend: 0.004 }),
      ]
    : [chain(wrap(0.002, 0), 0.013, { color: K.scarf, mirror: false })];
  const knot = scarfKnot(skin);
  out.push({
    shape: 'ellipsoid',
    at: knot,
    size: [0.011, 0.017, 0.013],
    color: K.scarf,
    mirror: false,
  });
  // The wrap crossing the knot's face.
  out.push(
    chain(
      [
        [knot[0] + 0.009, knot[1] - 0.012, knot[2] + 0.008],
        [knot[0] + 0.012, knot[1], knot[2]],
        [knot[0] + 0.009, knot[1] + 0.012, knot[2] - 0.008],
      ],
      0.0055,
      { color: K.scarfFaded, mirror: false, blend: 0.002 },
    ),
  );
  if (!fine) return out;
  for (const [i, tail] of scarfTails(skin).entries()) {
    // Three strands side by side across the tail's width, each ending at its own length.
    for (const [j, dy] of [-0.007, 0, 0.007].entries()) {
      const keep = tail.length - ((i + j) % 3);
      const line = tail.slice(0, keep).map((p): V => [p[0], p[1] + dy, p[2]]);
      out.push(...lock(line, 0.0052, 0.003, K.scarf, K.scarfMud, { mirror: false, seg: 3 }));
    }
  }
  return out;
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
      [0.01, 0.075],
      [0.034, 0.058],
    ] as const
  ).map(([dy, len]) =>
    spline(
      [
        knot,
        skin.off([knot[0] - 0.01, knot[1] + dy, knot[2] - len * 0.5], 0.011),
        skin.off([knot[0] - 0.012, knot[1] + dy * 1.4, knot[2] - len], 0.009),
      ],
      9,
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
