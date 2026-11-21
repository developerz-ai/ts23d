// The skin strips' textures, at true scale (D511): what skin looks like between the vertices.
// Albedo, normal and roughness come from one height field per zone, built from three measured
// scales of real facial skin: pores (pits ~0.2–0.4 mm wide, ~1 mm apart on the cheek, coarser
// and deeper on the nose and the T-zone, finer on the lids), the micro-relief network (the
// shallow grooves that cut skin into 1–3 mm plates) and a few-millimetre undulation that breaks
// a highlight up. Albedo is near white (the vertex colour carries the tone and its zones) with
// what a camera sees at 1 mm a pixel: pores a shade darker, a capillary-rose / melanin-gold
// mottle, sparse freckle dots; it averages to the old strips' 0.88, so a zone's tone stays put.
// Each zone strip gets its own pore size and gloss; the lids and crow's-feet zone (`face_skin_fine`)
// adds fine horizontal lines, the lips (`face_skin_wet`) vertical ones, a shaven beard
// (`face_skin_stubble`) the cut hairs. Isotropic otherwise: a box
// projection crosses any direction (D60). The rows are painted 16 mm tall (0.5 mm a texel on the
// 2048² sheet the hero uses, 0.25 mm at 4096²); `cells` keeps a pore at least 2.5 texels across.

import {
  defineMaterial,
  type Finish,
  type MaterialGraph,
  tex,
  type Vec3,
} from '@developerz.ai/ts23d';

/** World metres a skin strip's row is painted for (V). */
export const SKIN_ROW = 0.016;
/** World metres a skin strip spans along U before it repeats (0.49 mm a texel at 2048²). */
const SPAN = 1;
const SOURCES = [
  'https://physicallybased.info',
  'Flament et al. 2015, facial skin pores: a multiethnic study, Clin Cosmet Investig Dermatol 8:85',
  'Lagarde 2012, skin texturing for real-time (micro-relief network, 1–3 mm plates)',
];

/** One zone's skin: pore spacing (0: none) and depth, gloss on the crowns and in the pits, extra lines. */
interface Zone {
  readonly pore: number;
  readonly depth: number;
  /** Roughness in the pores and on the crowns between them. */
  readonly rough: readonly [number, number];
  /** Freckle dots' strength, 0 … 1. */
  readonly freckles: number;
  /** Share of freckle cells holding a dot (default 0.09: a sprinkle; the freckled strip's
   *  cluster is denser). */
  readonly dots?: number;
  /** Fine lines: 'across' (horizontal on a face: lids, crow's feet), 'down' (lip furrows). */
  readonly lines?: 'across' | 'down';
  /** Cut hairs: a dark stump in three cells of four, this far apart (a shaven beard). */
  readonly stubble?: number;
  readonly seed: number;
}

// Linear multipliers round the old strips' mean (0.88): capillary rose, neutral, melanin gold.
const ROSE: Vec3 = [0.9, 0.79, 0.77];
const NEUTRAL: Vec3 = [0.91, 0.88, 0.85];
const GOLD: Vec3 = [0.92, 0.87, 0.78];
const FRECKLE: Vec3 = [0.6, 0.47, 0.37];
const STUMP: Vec3 = [0.22, 0.19, 0.17];

function skinGraph(z: Zone): MaterialGraph {
  const s = z.seed;
  // 0 in a pore's pit, 1 on the skin round it.
  const pit =
    z.pore > 0
      ? tex.cells({ size: z.pore, out: 'f1', seed: s }).smoothstep(0.08, 0.4)
      : tex.constant(1);
  // 0 on the network's grooves.
  const net = tex
    .cells({ size: (z.pore || 0.0011) * 2.4, out: 'edge', seed: s + 1 })
    .smoothstep(0, 0.16);
  const undulate = tex.noise({ size: 0.004, octaves: 2, seed: s + 2 });
  const lines =
    z.lines === 'across'
      ? tex.ridged({ size: 0.014, sizeV: 0.0016, octaves: 2, seed: s + 3 }).invert()
      : z.lines === 'down'
        ? tex.ridged({ size: 0.0014, sizeV: 0.01, octaves: 2, seed: s + 3 }).invert()
        : undefined;
  const base = pit.mul(0.55).add(net.mul(0.25)).add(undulate.mul(0.2));
  const height = lines ? base.mul(0.7).add(lines.mul(0.3)) : base;
  // Freckles: a dot at the centre of one cell in eleven, or `dots` of them (same lattice: id and
  // f1 agree).
  const dots = tex
    .cells({ size: 0.0035, out: 'id', seed: s + 4 })
    .threshold(1 - (z.dots ?? 0.09))
    .mul(
      tex
        .cells({ size: 0.0035, out: 'f1', seed: s + 4 })
        .smoothstep(0.12, 0.32)
        .invert(),
    );
  const mottle = tex.noise({ size: 0.003, octaves: 3, seed: s + 5 });
  const albedo = mottle
    .levels(0.25, 0.75)
    .ramp([
      [0, ROSE],
      [0.5, NEUTRAL],
      [1, GOLD],
    ])
    .mix(FRECKLE, dots.mul(z.freckles))
    .mul(pit.remap(0.86, 1).mul(net.remap(0.95, 1.02)));
  const [inPit, onCrown] = z.rough;
  // Stumps: a dot ~0.3 mm across at most cells' centres, near black (× the vertex colour's shadow).
  const stumps = z.stubble
    ? tex
        .cells({ size: z.stubble, out: 'id', seed: s + 6 })
        .threshold(0.25)
        .mul(
          tex
            .cells({ size: z.stubble, out: 'f1', seed: s + 6 })
            .smoothstep(0.15, 0.4)
            .invert(),
        )
    : undefined;
  return tex.material({
    height,
    depth: z.depth,
    albedo: stumps ? albedo.mix(STUMP, stumps) : albedo,
    roughness: pit.remap(inPit, onCrown).add(undulate.remap(-0.04, 0.04)).clamp(0.05, 1),
  });
}

// Freckles live in the freckled strip, gathered where `freckleZone` (./skin-zones.ts) puts it: a
// sprinkle of the same density on every strip read as sandy grain from forehead to chin (D520).
// The others keep a trace.

/** Cheeks (and any skin no zone claims): ~1 mm pores, matte between them. */
export const SKIN_STRIP = defineMaterial({
  id: 'face_skin',
  // Its hash row (11) is the hydra's scales; 13 is free of every material the repo defines.
  row: 13,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.56,
  graph: skinGraph({ pore: 0.0011, depth: 0.00016, rough: [0.7, 0.52], freckles: 0.12, seed: 11 }),
  description: 'Skin at true scale: ~1 mm pores, micro-relief plates, rose/gold mottle, freckles.',
  sources: SOURCES,
});

/** The oily T-zone (forehead centre, nose, chin): coarser, deeper pores, glossy between them,
 *  so a highlight runs down the nose and across the brow broken into grain. */
export const SKIN_OILY = defineMaterial({
  id: 'face_skin_oily',
  row: 12,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.42,
  // (Satin, not wet: at 0.2 the forehead and a bald crown lit up like glazed latex.)
  graph: skinGraph({ pore: 0.0015, depth: 0.00024, rough: [0.62, 0.36], freckles: 0.1, seed: 12 }),
  description: 'Oily skin (T-zone): coarser, deeper pores, glossy crowns.',
  sources: SOURCES,
});

/** Matte skin: a scalp, shaven or bald (dry, few oil glands), and any skin a recipe wants
 *  without a highlight: a broad soft sheen on a dome instead of hot spots. */
export const SKIN_MATTE = defineMaterial({
  id: 'face_skin_matte',
  // Row 8: free on every bust (the cloth strips hold 7, 10, 11; the skin 6, 9, 12, 13).
  row: 8,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.82,
  graph: skinGraph({ pore: 0.0012, depth: 0.00016, rough: [0.9, 0.76], freckles: 0.08, seed: 8 }),
  description: 'Matte skin (scalp): the pores of face_skin, dry and rough between them.',
  sources: SOURCES,
});

/** Clear skin (the forehead's sides, temples, jaw, neck: `clearZone`): the finest, shallowest
 *  pores, a step from glossy; what the coarse cheek and nose pores fade into (D520). */
export const SKIN_CLEAR = defineMaterial({
  id: 'face_skin_clear',
  // Row 0: free on every bust (hair 1/2/4, stubble 5, skin 6/8/9/12/13, cloth 7/10/11).
  row: 0,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.54,
  graph: skinGraph({ pore: 0.0007, depth: 0.00007, rough: [0.62, 0.5], freckles: 0.04, seed: 3 }),
  description: 'Clear skin: the finest, shallowest pores (forehead sides, jaw, neck).',
  sources: SOURCES,
});

/** Freckled skin: the cheek's pores with a dense cluster of soft tan dots, 1–2 mm across; onSkin
 *  dithers it over the nose's bridge and the cheekbones, so their density fades out (D520). */
export const SKIN_FRECKLED = defineMaterial({
  id: 'face_skin_freckled',
  // Row 3: free on every bust.
  row: 3,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.56,
  graph: skinGraph({
    pore: 0.0011,
    depth: 0.00016,
    rough: [0.7, 0.52],
    freckles: 0.7,
    dots: 0.3,
    seed: 4,
  }),
  description: 'Freckled skin: face_skin with a dense cluster of soft tan freckles.',
  sources: SOURCES,
});

/** Thin skin round the eyes (lids, under the eye, the crow's-feet corner): the finest pores
 *  and fine horizontal lines, a little glossier than the cheek. */
export const SKIN_FINE = defineMaterial({
  id: 'face_skin_fine',
  // Row 6: free on every bust and skinned asset (hair 1/4, cloth 7/10/11, skin 8/9/12/13).
  row: 6,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.5,
  graph: skinGraph({
    pore: 0.0008,
    depth: 0.00012,
    rough: [0.62, 0.46],
    freckles: 0.05,
    lines: 'across',
    seed: 6,
  }),
  description: 'Thin skin (lids, crow’s feet): fine pores and fine horizontal lines.',
  sources: SOURCES,
});

/** A shaven beard's skin: face_skin's pores with the cut hairs as dense dark dots ~1 mm apart,
 *  so stubble reads as hairs on skin, not as a grey wash (D514). */
export const SKIN_STUBBLE = defineMaterial({
  id: 'face_skin_stubble',
  // Row 5: free on every bust (hair 1/4, skin 6/8/9/12/13, cloth 7/10/11).
  row: 5,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.6,
  graph: skinGraph({
    pore: 0.0011,
    depth: 0.00016,
    rough: [0.72, 0.56],
    freckles: 0,
    stubble: 0.0009,
    seed: 5,
  }),
  description: 'Shaven skin: face_skin with dense dark cut-hair dots (stubble).',
  sources: SOURCES,
});

/** Wet skin: the lips' vermilion and the lid margins. No pores; vertical lip lines, glossy. */
export const SKIN_WET = defineMaterial({
  id: 'face_skin_wet',
  // Row 9 is the reptile scales' hash row: no bust maps onto them.
  row: 9,
  scaleMetres: SKIN_ROW,
  spanMetres: SPAN,
  roughness: 0.16,
  graph: skinGraph({
    pore: 0,
    depth: 0.00008,
    rough: [0.24, 0.13],
    freckles: 0,
    lines: 'down',
    seed: 9,
  }),
  description:
    'Wet skin (lips, lid margins): glossy, vertical lip lines; vertex colour carries the tone.',
  sources: SOURCES,
});

/**
 * The `skin` finish every bust declares: a soft grazing sheen (the down and the oil a cheek
 * catches) in the race's own `sheen` colour and a dielectric reflectance a little under plastic's,
 * and NO clearcoat. A clear coat is one roughness over the whole part, so it lit the shoulders,
 * scalp and cheeks with the same tight wet highlight (latex); without it the highlight comes from
 * the strips' own roughness: matte cheeks and shoulders, the oily T-zone, the wet lips.
 */
export function skinFinish(sheen: string): Finish {
  return { sheen: { colour: sheen, roughness: 0.55 }, specular: { factor: 0.8 } };
}
