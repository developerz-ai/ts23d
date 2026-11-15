// The whole-bust builder shared by the human, elf and goblin busts: ONE sculpt (parametric head,
// anatomical ears, torso, the recipe's hair/beard/outfit edits) meshed as two parts split at the
// neck seam under a collar — `head` fine, `bust` coarser — plus socketed `eye_l` / `eye_r`
// (cornea finish), the recipe's hard extras (brooch, jewellery) and a turned plinth, vertex AO
// across everything. A recipe supplies only its spec and its own edits.

import {
  type BuildContext,
  bakeAo,
  createRng,
  type DetailRegion,
  type Field,
  type Mesh,
  merge,
  type Rng,
  type SculptEdit,
  sculptField,
} from '@developerz.ai/ts23d';
import { featureStrokes } from '../face/features.ts';
import { type Forms, HERO_FORMS, muscleStrokes, planeStrokes } from '../face/planes.ts';
import { skullEdit, skullLandmarks, skullOf } from '../face/skull.ts';
import type { Character } from '../face/spec.ts';
import { type Zones, zoneEdits } from '../face/zones.ts';
import { type EarSpec, earEdits } from './ear.ts';
import { type EyeSpec, eyes } from './eye.ts';
import { faceEdits, orbitBore } from './face.ts';
import { type HeadSpec, headBlock, type Landmarks } from './head.ts';
import { type Surface, surface, type V } from './kit.ts';
import { plinth } from './plinth.ts';
import { type SkinTone, skinMesh } from './skin.ts';
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
  /** Extra skin edits after the anatomy (race features like tusks or warts). */
  readonly features?: (stage: number, skin: Surface, lod: number, rng: Rng) => SculptEdit[];
  /** Hair, beard: `scalp` is the head block's field. */
  readonly hair: (scalp: Field, lod: number) => SculptEdit[];
  /** Outfit sculpted onto the torso: `body` is the torso's field, `skin` the stage-2 surface. */
  readonly outfit: (body: Field, skin: Surface, lod: number) => SculptEdit[];
  /** Hard extras as their own parts (brooch, earrings…). */
  readonly extras?: (ctx: BuildContext, skin: Surface) => Record<string, Mesh>;
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
  return [{ ...e, blend: 0.08 * l.H }];
}

/** LOD0 detail boxes on a skull-stage head (sdf-detail.ts): the eyes and lids at a quarter cell,
 *  each ear (thin blade, pointed tip) at half. */
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
      ...torsoEdits(b.l, b.torso, { neck: false }),
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
  const body = sculptField(torsoEdits(b.l, b.torso), opts).field;
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

export function buildBust(ctx: BuildContext, b: BustRecipe): void {
  if (!b.skull) checkNeck(b.l, b.torso, b.neck);
  const lod = ctx.lod;
  const { edits, skin } = bustEdits(b, ctx.pick([4, 4, 2]), lod, ctx.rng.fork('features'));
  const seam = neckSeam(b.l).field;
  const cell = ctx.pick(b.cells.head);
  const bustCell = ctx.pick(b.cells.bust);
  const lap = bustCell * 0.5;
  const rng = ctx.rng.fork('skin');
  const { l } = b;
  const meshes: Record<string, Mesh> =
    lod === 2
      ? { head: skinMesh(edits, cell, { rng, tone: b.tone }) }
      : {
          head: skinMesh(edits, cell, {
            rng,
            tone: b.tone,
            bumps: lod === 0 ? 0.0002 : 0,
            ...(lod === 0 && b.skull ? { detail: faceDetail(b) } : {}),
            clip: (p) => -seam(p) - lap,
            within: [
              [l.back - 0.1, -0.3, l.mz - 0.5 * l.H],
              [l.gx + 0.15, 0.3, l.crown + 0.1],
            ],
          }),
          bust: skinMesh(edits, bustCell, {
            rng,
            tone: b.tone,
            clip: (p) => seam(p) - lap,
            within: [
              [-0.4, -0.4, 0],
              [0.4, 0.4, l.mz],
            ],
          }),
          ...(b.extras ? b.extras(ctx, skin) : {}),
        };
  meshes['plinth'] = plinth(ctx, {
    radius: b.plinth.radius,
    top: b.torso.cutZ,
    color: b.plinth.color,
  });
  const all = merge(Object.values(meshes));
  for (const [name, m] of Object.entries(meshes))
    ctx.part(
      name,
      lod < 2 ? bakeAo(m, { samples: ctx.pick([14, 9, 6]), radius: 0.08, strength: 0.45 }, all) : m,
    );
  eyes(ctx, b.eye, {
    cell: ctx.pick([0.0016, 0.003, 0.008]),
    finish: 'cornea',
    proud: lod === 0 ? 0 : cell * 0.3,
    // The orbit's seat resolves at LOD0 only (coarser cells close a 1 cm-radius hollow).
    ...(lod === 0 ? { socketIn: 'head' } : {}),
  });
}
