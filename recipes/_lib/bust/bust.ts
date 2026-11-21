// The whole-bust builder shared by the human, elf and goblin busts: ONE sculpt (parametric head,
// anatomical ears, torso, the recipe's hair/beard/outfit edits) meshed as two parts split at the
// neck seam under a collar — `head` fine, `bust` coarser — plus socketed `eye_l` / `eye_r`
// (cornea finish), the recipe's hard extras (brooch, jewellery) and a turned plinth, vertex AO
// across everything. A recipe supplies only its spec and its own edits.

import {
  type BuildContext,
  bakeAo,
  bakeSourceOf,
  createRng,
  type DetailRegion,
  type Field,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculptField,
  withBakeSource,
} from '@developerz.ai/ts23d';
import { featureStrokes } from '../face/features.ts';
import { type Forms, HERO_FORMS, muscleStrokes, planeStrokes } from '../face/planes.ts';
import { eyeZone, lipZone, scalpZone, tZone } from '../face/skin-strip.ts';
import { type Complexion, complexionZones } from '../face/skin-zones.ts';
import { skullEdit, skullLandmarks, skullOf } from '../face/skull.ts';
import type { Character } from '../face/spec.ts';
import { type Zones, zoneEdits } from '../face/zones.ts';
import { type EarSpec, earEdits } from './ear.ts';
import { type EyeSpec, eyes } from './eye.ts';
import { faceEdits, orbitBore } from './face.ts';
import { faceRigOf, withFace } from './face-rig.ts';
import { type HeadSpec, headBlock, type Landmarks } from './head.ts';
import { type Surface, surface, type V } from './kit.ts';
import { plinth } from './plinth.ts';
import { type ScalpPaint, type SkinTone, skinMesh } from './skin.ts';
import { checkNeck, type NeckRange, neckSeam, type TorsoSpec, torsoEdits } from './torso.ts';

export interface BustRecipe {
  readonly spec: HeadSpec;
  readonly l: Landmarks;
  readonly eye: EyeSpec;
  readonly ear: EarSpec;
  readonly torso: TorsoSpec;
  /** The neck's declared ratio ranges (default: human, NECK_HUMAN); `checkNeck` enforces them. */
  readonly neck?: NeckRange;
  readonly tone: SkinTone;
  /** Scalp/beard regions painted hair-coloured under card hair (D57; `scalpCoverCheck`). */
  readonly scalp?: readonly ScalpPaint[];
  /** Skin painter knobs: curvature stencil (wider on a ringing mesh field) and pore speckle. */
  readonly paint?: { readonly stencil?: number; readonly speckle?: number };
  readonly plinth: { readonly radius: number; readonly color: V };
  /** Cells per LOD: head, bust. */
  readonly cells: {
    readonly head: readonly [number, number, number];
    readonly bust: readonly [number, number, number];
  };
  /** The skull stage: the race's warped CC0 base head (cranium, face, ears and neck from one
   *  anatomical mesh, recipes/_lib/face/skull.ts) in place of the primitive head block, face and
   *  ears. */
  readonly skull?: Character;
  /** How strongly the skull's planes, muscles and lines read (default the human hero's). */
  readonly forms?: Forms;
  /** Skin tone zones on the skull (lips, redness, beard shadow, brows). */
  readonly zones?: Zones;
  /** The torso in place of the shared parametric one (a race with its own build, the orc's
   *  trapezius rising to the ears): stage → edits; `skin` is the stage-2 surface from stage 3. */
  readonly body?: (stage: number, skin?: Surface) => SculptEdit[];
  /** Extra skin edits after the anatomy (race features like tusks or warts). */
  readonly features?: (stage: number, skin: Surface, lod: number, rng: Rng) => SculptEdit[];
  /** Hair, beard: `scalp` is the head block's field. */
  readonly hair: (scalp: Field, lod: number) => SculptEdit[];
  /** Outfit sculpted onto the torso: `body` is the torso's field, `skin` the stage-2 surface. */
  readonly outfit: (body: Field, skin: Surface, lod: number) => SculptEdit[];
  /** Where `head` and `bust` split (≤ 0 = bust), default the neck seam plane; a bust whose
   *  shoulders rise over that plane bends it up there, so the shoulders stay in `bust`. */
  readonly split?: Field;
  /** Hard extras as their own parts (brooch, earrings…); `skin` is the full stage-2 anatomy
   *  (a dressed bust's is the whole body, not the one cut away under its outfit: layers.ts). */
  readonly extras?: (ctx: BuildContext, skin: Surface) => Record<string, Mesh>;
  /** Skin on the shared pore strip (../face/skin-strip.ts): pore relief and a roughness that
   *  follows it, glossier on the T-zone of a skull-stage head. Default: the `plain` strip. */
  readonly pores?: boolean;
  /** Freckles gathered over the bridge and cheekbones, fine skin (../face/skin-zones.ts, D520);
   *  a skull-stage head on the pore strip gets clear skin off its nose and cheeks either way. */
  readonly complexion?: Complexion;
  /** A beard's line (≤ 0 inside): its edge fades into the skin as the stubble strip's cut hairs,
   *  dithered from 4 mm inside to 1.2 cm outside (D523); omit for none. */
  readonly stubble?: Field;
  /** The glow of light through thin ear skin (rim, helix, a long tip), painted on a skull-stage
   *  head's ears (skin.ts `translucent`, D522); omit for none. */
  readonly translucent?: V;
  /** The asset's finish for `head` and `bust` (a skin sheen declared in `finishes`). */
  readonly finish?: string;
  /** The bust's arm cut (torso.ts `armCut`; kept where ≤ 0), applied to the skull stage too: the
   *  base mesh brings shoulders of its own, which would stand proud of a torso sawn inside them. */
  readonly saw?: Field;
  /** The colour of the sawn section (default SECTION: a dark neutral, as a cut through cloth
   *  and body reads in shadow). */
  readonly section?: V;
}

/** The sawn section of a bust: dark, as the cut faces of its cloth are. */
export const SECTION: V = [0.1, 0.09, 0.085];

/** Paints the last millimetres behind the saw cut the section's colour (after every skin edit:
 *  the skull stage's sawn shoulders are skin-coloured otherwise). */
function sectionPaint(b: BustRecipe): SculptEdit[] {
  const saw = b.saw;
  if (!saw) return [];
  return [
    {
      field: (p) => -saw(p) - 0.0065,
      bounds: [
        [-0.5, -0.5, 0],
        [0.5, 0.5, b.l.mz],
      ],
      op: 'paint',
      blend: 0.001,
      color: b.section ?? SECTION,
    },
  ];
}

/** The T-zone of a skull-stage head as the pore strip's oil mask: the forehead's centre band up
 *  to a tenth of the head's height over the glabella (higher, it took the whole dome, and a bald
 *  crown lit up with wet hot spots), the nose and the chin. */
export function oilOf(b: BustRecipe): Field | undefined {
  if (!b.skull) return undefined;
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  return tZone(
    {
      forehead: [k.glabella[0], 0, k.glabella[2] + SCALP_FROM * b.spec.H],
      glabella: k.glabella,
      noseTip: k.pronasale,
      chin: k.pogonion,
    },
    Math.abs(k.alare[1]),
  );
}

/** Where the scalp starts over the glabella, in head heights: above it the skin is matte. */
const SCALP_FROM = 0.1;

/** The scalp of a skull-stage head as the pore strip's matte mask (../face/skin-strip.ts). */
export function scalpOf(b: BustRecipe): Field | undefined {
  if (!b.skull) return undefined;
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  return scalpZone({
    forehead: [k.glabella[0], 0, k.glabella[2] + SCALP_FROM * b.spec.H],
    tragion: k.tragion,
  });
}

/** The thin skin round the eyes (fine pores and lines) and the lips (wet) of a skull-stage head
 *  as the pore strips' masks (../face/skin-strip.ts, D511). */
export function lidsAndLipsOf(b: BustRecipe): { readonly fine?: Field; readonly moist?: Field } {
  if (!b.skull) return {};
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  return {
    fine: eyeZone({ eye: k.eye, r: k.eyeR }),
    moist: lipZone({ sup: k.labraleSup, inf: k.labraleInf, corner: k.cheilion }),
  };
}

/** A skull-stage head's freckle and clear-skin masks (../face/skin-zones.ts, D520). */
export function complexionOf(b: BustRecipe): { readonly freckle?: Field; readonly clear?: Field } {
  if (!b.skull) return {};
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  // (Scale: the eye ball is 12.8 mm on the measured base.)
  return complexionZones(k, k.eyeR / 0.0128, b.complexion);
}

/** A beard line as a soft stubble mask: 1 from 4 mm inside it, 0 at 1.2 cm outside. */
const stubbleEdge =
  (line: Field): Field =>
  (p) =>
    Math.min(1, Math.max(0, (0.012 - line(p)) / 0.016));

/** A skull-stage head's ears as a region (1 on them): beside the head past the tragion's
 *  width less 6 mm, behind the cheek's front, from under the lobe up past the helix tip. */
export function earsOf(b: BustRecipe): Field | undefined {
  if (!b.skull) return undefined;
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  const y0 = Math.abs(k.tragion[1]) - 0.006;
  const front = k.tragion[0] + 0.012;
  const low = k.earLobe[2] - 0.006;
  return (p) =>
    Math.min(1, Math.max(0, (Math.abs(p[1]) - y0) / 0.004)) * (p[0] < front && p[2] > low ? 1 : 0);
}

/** The skull field's sample spacing per LOD, metres (and the face box's, LOD0). */
const SKULL_CELL = [0.002, 0.003, 0.006] as const;
const FACE_CELL = 0.001;

/** The skull stage as one edit, blended onto the torso's trapezius and chest. */
export function skullStage(b: BustRecipe, lod: number): SculptEdit[] {
  if (!b.skull) return [];
  const { l } = b;
  const e = skullEdit(skullOf(b.skull, b.spec), {
    cell: SKULL_CELL[lod] ?? 0.006,
    ...(lod === 0 ? { fineCell: FACE_CELL } : {}),
    fine: lod === 0,
    cut: { at: [0, 0, l.mz - 0.42 * l.H], normal: [-0.3, 0, -1] },
    color: b.spec.skin,
  });
  const saw = b.saw;
  if (!saw) return [{ ...e, blend: 0.08 * l.H }];
  return [
    {
      group: [
        e,
        {
          // (4 mm short of the cut: a dressed bust's section face is a garment layer's. Below
          // the chin only: a goblin's ears reach out past its shoulders.)
          field: (p) => Math.min(saw(p) + 0.004, l.mz - p[2]),
          bounds: [
            [-2, -2, -1],
            [2, 2, 3],
          ],
          op: 'intersect',
          blend: 0.07 * l.H,
        },
      ],
      blend: 0.08 * l.H,
    },
  ];
}

/** LOD0 detail boxes on a skull-stage head (sdf-detail.ts): the eyes and lids at a quarter cell,
 *  each ear (thin blade, pointed tip) and the mouth with the nose's base (lip line, nostrils) at
 *  half. The rest of the head is broad form a 6 mm cell holds (measured: a 4.8 mm head and a
 *  6.4 mm one render alike at 2.6 × the hero's distance, but for the lip corners). */
export function faceDetail(b: BustRecipe): DetailRegion[] {
  if (!b.skull) return [];
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  const [ex, , ez] = k.eye;
  const R = k.eyeR;
  const top = ez - R * 1.4;
  const wy = Math.abs(k.exocanthion[1]) + R * 0.9;
  return [
    {
      bounds: [
        [ex - R * 0.2, -wy, top],
        [ex + R * 1.8, wy, ez + R * 1.5],
      ],
      factor: 4,
    },
    ...earBoxes(k, wy),
    mouthBox(k),
  ];
}

function mouthBox(k: ReturnType<typeof skullLandmarks>): DetailRegion {
  const w = Math.abs(k.cheilion[1]) + 0.012;
  return {
    bounds: [
      [k.stomion[0] - 0.035, -w, k.stomion[2] - 0.025],
      [k.pronasale[0] + 0.01, w, k.alare[2]],
    ],
    factor: 2,
  };
}

/** The far LOD's face mask (sdf-detail.ts): one box from the chin to over the brows and out past
 *  the outer eye corners, meshed at half the head's cell, so the planes a game artist's hand-made
 *  LOD keeps hold: the brow over the sockets, the nose, the lips. At the head's own 2–2.6 cm cell
 *  they melted into an egg with the eyeballs bulging out of it (D551). LOD1's 1 cm cell keeps
 *  them already (a band over the eyes there cost ~1 000 triangles for 1–2 mm of socket). */
export function farFaceDetail(b: BustRecipe, lod: number): DetailRegion[] {
  if (!b.skull || lod !== 2) return [];
  const k = skullLandmarks(skullOf(b.skull, b.spec));
  const R = b.eye.r;
  const wy = Math.abs(k.exocanthion[1]) + R * 0.6;
  const x0 = b.eye.centre[0] - R * 0.8;
  return [
    {
      bounds: [
        [x0, -wy, k.pogonion[2] - 0.006],
        [k.pronasale[0] + 0.006, wy, k.brow[2] + R * 0.6],
      ],
      factor: 2,
    },
  ];
}

/** A box round each ear (both sides), its inner wall kept clear of the eye box at `wy`. */
function earBoxes(k: ReturnType<typeof skullLandmarks>, wy: number): DetailRegion[] {
  const pts = [k.tragion, k.earTop, k.earTip, k.earOut, k.earBack, k.earLobe];
  const lo = [0, 1, 2].map((a) => Math.min(...pts.map((p) => p[a] ?? 0)) - 0.01);
  const hi = [0, 1, 2].map((a) => Math.max(...pts.map((p) => p[a] ?? 0)) + 0.01);
  const inner = Math.max(lo[1] ?? 0, wy + 0.012);
  return [1, -1].map(
    (s): DetailRegion => ({
      bounds: [
        [lo[0] ?? 0, s > 0 ? inner : -(hi[1] ?? 0), lo[2] ?? 0],
        [hi[0] ?? 0, s > 0 ? (hi[1] ?? 0) : -inner, hi[2] ?? 0],
      ],
      factor: 2,
    }),
  );
}

function anatomy(b: BustRecipe, stage: number, lod: number, s?: Surface): SculptEdit[] {
  if (b.skull) {
    const k = skullLandmarks(skullOf(b.skull, b.spec));
    const f = b.forms ?? HERO_FORMS;
    const H = b.spec.H;
    return [
      ...(b.body ? b.body(stage, s) : torsoEdits(b.l, b.torso, { neck: false })),
      ...skullStage(b, lod),
      // The orbit: room for the eyeball (the base's own pocket seals shut once the lids close
      // in to a cell) and the snug bore behind its equator the socket joint measures.
      {
        shape: 'sphere',
        at: b.eye.centre,
        size: b.eye.r * 1.03,
        op: 'subtract',
        blend: b.eye.r * 0.1,
      },
      orbitBore({ eye: b.eye.centre, eyeR: b.eye.r }),
      ...(stage >= 2 ? planeStrokes(k, H, f) : []),
      ...(stage >= 3 ? muscleStrokes(k, H, f) : []),
      ...(stage >= 4 ? featureStrokes(k, H, f) : []),
      ...(stage >= 4 && b.zones ? zoneEdits(k, H, b.zones) : []),
      ...sectionPaint(b),
    ];
  }
  return [
    ...torsoEdits(b.l, b.torso),
    headBlock(b.spec, stage),
    ...faceEdits(b.spec, b.eye, stage, s),
    // LOD2: the ear keeps its tip — never thinner than the coarse cell.
    ...earEdits({
      ...b.ear,
      simple: lod === 2,
      thick: lod === 2 ? Math.max(b.ear.thick, b.cells.head[2] * 1.1) : b.ear.thick,
    }),
  ];
}

/**
 * The scalp the hair grows from (slice 07's hair cards root on it): the skull stage's field when
 * the bust has one, else the primitive head block. Signed distance, metres, ≤ 0 inside.
 */
export function bustScalp(b: BustRecipe, lod: number): Field {
  const opts = { color: b.spec.skin, mirror: 'y' as const };
  return b.skull
    ? sculptField(skullStage(b, lod), opts).field
    : sculptField([headBlock(b.spec, 2)], opts).field;
}

/** Every skin edit at a stage (stage 3+ strokes lie on the stage-2 surface). */
export function bustEdits(
  b: BustRecipe,
  stage: number,
  lod: number,
  rng: Rng = createRng(1),
): { edits: SculptEdit[]; skin: Surface } {
  const opts = { color: b.spec.skin, mirror: 'y' as const };
  const skin = surface(sculptField(anatomy(b, 2, lod), opts).field);
  const body = sculptField(b.body ? b.body(2) : torsoEdits(b.l, b.torso), opts).field;
  const scalp = bustScalp(b, lod);
  return {
    skin,
    edits: [
      ...anatomy(b, stage, lod, stage >= 3 ? skin : undefined),
      ...(stage >= 3 && b.features ? b.features(stage, skin, lod, rng) : []),
      ...b.hair(scalp, lod),
      ...b.outfit(body, skin, lod),
    ],
  };
}

/** Hero tier (ADR 012): LOD0 head and bust cells grow by these; the field's detail is baked. */
export const HERO_CELL = { head: 2.2, bust: 1.5 } as const;

/** `hero`: a lighter LOD0 whose skin parts carry their field for the hero bake (finish/hero.ts).
 *  `skin`: the anatomy handed to `extras` in place of the built one (layers.ts). */
export function buildBust(
  ctx: BuildContext,
  b: BustRecipe,
  o: { hero?: boolean; skin?: Surface } = {},
): void {
  if (!b.skull) checkNeck(b.l, b.torso, b.neck);
  const lod = ctx.lod;
  const hero = o.hero === true && lod === 0;
  const { edits, skin } = bustEdits(b, ctx.pick([4, 4, 2]), lod, ctx.rng.fork('features'));
  const seam = b.split ?? neckSeam(b.l).field;
  const cell = ctx.pick(b.cells.head) * (hero ? HERO_CELL.head : 1);
  const bustCell = ctx.pick(b.cells.bust) * (hero ? HERO_CELL.bust : 1);
  const lap = bustCell * 0.5;
  const rng = ctx.rng.fork('skin');
  const { l } = b;
  const oil = b.pores ? oilOf(b) : undefined;
  const matte = b.pores ? scalpOf(b) : undefined;
  const ears = b.translucent ? earsOf(b) : undefined;
  const look = {
    tone: b.tone,
    ...b.paint,
    ...(b.translucent && ears ? { translucent: { color: b.translucent, region: ears } } : {}),
    ...(b.scalp ? { scalp: b.scalp } : {}),
    ...(b.pores
      ? {
          strip: {
            ...(oil ? { oil } : {}),
            ...(matte ? { matte } : {}),
            ...lidsAndLipsOf(b),
            // (Dithered per triangle: the far LOD's 2 cm triangles would patch it.)
            ...(lod < 2 ? complexionOf(b) : {}),
            ...(lod < 2 && b.stubble ? { stubble: stubbleEdge(b.stubble) } : {}),
          },
        }
      : {}),
  };
  const meshes: Record<string, Mesh> =
    lod === 2
      ? { head: skinMesh(edits, cell, { rng, ...look, far: true, detail: farFaceDetail(b, lod) }) }
      : {
          head: skinMesh(edits, cell, {
            rng,
            ...look,
            bumps: lod === 0 ? 0.0002 : 0,
            ...(lod === 0 && b.skull ? { detail: faceDetail(b) } : {}),
            // (LOD1's 1 cm vertices average the paint over their faces, as LOD2's do, D552.)
            ...(lod === 1 ? { far: true } : {}),
            clip: (p) => -seam(p) - lap,
            within: [
              [l.back - 0.1, -0.3, l.mz - 0.5 * l.H],
              [l.gx + 0.15, 0.3, l.crown + 0.1],
            ],
          }),
          bust: skinMesh(edits, bustCell, {
            rng,
            ...look,
            ...(lod === 1 ? { far: true } : {}),
            clip: (p) => seam(p) - lap,
            within: [
              [-0.4, -0.4, 0],
              [0.4, 0.4, l.mz],
            ],
          }),
          ...(b.extras ? b.extras(ctx, o.skin ?? skin) : {}),
        };
  meshes['plinth'] = plinth(ctx, {
    radius: b.plinth.radius,
    top: b.torso.cutZ,
    color: b.plinth.color,
  });
  const all = merge(Object.values(meshes));
  // Head and bust carry the blink / talk / breathe morphs under one `face` node (headClips('face')).
  const rig = faceRigOf(b);
  ctx.group('face');
  for (const [name, m] of Object.entries(meshes)) {
    const lit =
      lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.08, strength: 0.45 }, all) : m;
    const face = name === 'head' || name === 'bust';
    const src = hero ? bakeSourceOf(m) : undefined;
    const part = withFace(name, lit, rig);
    ctx.part(
      name,
      src ? withBakeSource(part, src) : part,
      face ? { parent: 'face', ...(b.finish ? { finish: b.finish } : {}) } : undefined,
    );
  }
  eyes(ctx, b.eye, {
    cell: ctx.pick([0.002, 0.0036, 0.01]),
    finish: 'cornea',
    // (Out of the coarse lids a little; LOD2's face box holds its sockets at half its cell, D551.)
    proud: lod === 0 ? 0 : cell * 0.15,
    lidShadow: 0.55,
    // The orbit's seat resolves at LOD0 only (coarser cells close a 1 cm-radius hollow).
    ...(lod === 0 ? { socketIn: 'head' } : {}),
  });
}
