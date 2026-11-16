// Creature kind: `creature(ctx, spec)` sculpts a whole animal from a skeleton type, a stance and a
// few sourced proportions, and emits the engine contract: `body` (trunk, neck, legs, tail, wings,
// fins: one blended sculpt), `head` (pivot at the atlas), `eye_l` / `eye_r` (pivots at the ball
// centres, in lidded sockets), `claws` (grown from the toes). `defineCreature` wraps defineAsset
// with the creases, biology checks (balance, quadruped fore share) and densities the gates need. LOD policy: sculpt cell ≈ 13% of
// the upper-limb radius at LOD0, ×2.2 at LOD1, ×6.5 at LOD2 where the legs become tubes, relief
// drops and the eyes become painted spots (the coarse orbit would swallow a ball).

import {
  type Asset,
  type AssetDefinition,
  type Budget,
  type BuildContext,
  defineAsset,
  type Mesh,
  merge,
  place,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import type { StripId } from '../material/index.ts';
import { type Biology, balanced, biology, foreShareCheck } from './creature-biology.ts';
import { bodyEdits } from './creature-body.ts';
import { type Bones, headToWorld } from './creature-bones.ts';
import { creatureArmature, creatureClips } from './creature-clips.ts';
import { bodyPaint, headPaint, palette } from './creature-coat.ts';
import { creatureCreases } from './creature-creases.ts';
import { mixRgb, smoothstep, v3 } from './creature-curve.ts';
import { detailBoxes, headDetail } from './creature-detail.ts';
import { eyeball } from './creature-eye.ts';
import { clawMesh } from './creature-feet.ts';
import { creatureFur } from './creature-fur.ts';
import { type HeadLayout, headEdits } from './creature-head.ts';
import { creatureHeadFur } from './creature-head-fur.ts';

export { bodyRes } from './creature-lod.ts';

import { legTubes } from './creature-limbs.ts';
import { creatureCells, HERO_CELL, heroField, heroTag, pitchedSource } from './creature-lod.ts';
import { sculptPiece } from './creature-mesh.ts';
import { creatureRig } from './creature-rig.ts';
import { bonesOf } from './creature-skeleton.ts';
import { jawHinge } from './creature-skull.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';
import { relief } from './creature-surface.ts';

export interface CreatureOptions {
  /** Part-name prefix (`wolf_` → `wolf_body`, `wolf_head` …). Default none. */
  readonly prefix?: string;
  /** Trim-sheet strip of the skin/coat (e.g. a neutral fur strip registered by the recipe). */
  readonly strip?: StripId;
  /** Hero tier (ADR 012): lighter LOD0 tagged with its fine field (creature-hero.ts). */
  readonly hero?: boolean;
}

export interface CreatureInfo {
  readonly bones: Bones;
  readonly head: HeadLayout;
  readonly biology: Biology;
  readonly parts: {
    body: string;
    head: string;
    jaw: string;
    eyeL: string;
    eyeR: string;
    claws: string | null;
  };
}

/** Cards weigh as a 0.2 mm keratin sheet (the coat's bulk is in the body's `coat` already) and
 *  never collide: open sheets have no volume to give the mass or the collider. */
const HAIR_PHYSICS = { shell: 0.0002, density: 1300, collider: 'none' } as const;

/** Validated spec + skeleton + biology; throws T3D_RECIPE_INVALID on an impossible animal. */
export function creaturePlan(spec: CreatureSpec): { bones: Bones; biology: Biology } {
  const s = checkCreature(spec);
  const bones = bonesOf(s);
  const bio = biology(s, bones);
  const first = bio.findings[0];
  if (first)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause: `creature: ${first.message}`,
      fix: first.fix,
    });
  return { bones, biology: bio };
}

export function creature(
  ctx: BuildContext,
  spec: CreatureSpec,
  o: CreatureOptions = {},
): CreatureInfo {
  const { bones: b, biology: bio } = creaturePlan(spec);
  const lod = ctx.lod;
  const p = o.prefix ?? '';
  const c = palette(spec.colours);
  const hero = o.hero === true && lod === 0;
  const { res0, res, hres } = creatureCells(b, lod, hero);
  const surface = spec.surface ?? 'fur';
  // Head layout first: the armature's jaw bone and the skin's blink read it (creature-rig.ts).
  const h = b.head;
  const he = headEdits(b, spec, lod, hres);
  const l = he.layout;
  const [hx, , hz] = jawHinge(l);
  const hinge: Vec3 = [hx, 0, hz];
  const arm = creatureArmature(b, spec, p).bones;
  const rig = creatureRig(b, arm, p, l.eye);
  const paint = bodyPaint(b, spec, Math.min(res * 0.6, (spec.pattern?.scale ?? 1) * 0.12));
  // LOD0: the skin's relief. LOD2: coarse cells cut convex curves short — grow the shell back by
  // ~⅕ cell, fading to nothing at the soles so the feet stay on z = 0.
  const grow = res * 0.2;
  const rel =
    lod === 0
      ? relief(surface, res0, Math.max(res0 * 4, b.height * 0.04), 7)
      : lod === 2
        ? { amp: grow, at: (q: Vec3) => grow * smoothstep(0, res, q[2]) }
        : null;
  // Strand streaks in the painted tone only on fur (scales, feathers, skin carry none).
  const strands = surface === 'fur' ? {} : { strands: 0 };
  const piece = sculptPiece({
    edits: bodyEdits(b, spec, lod, res, c.keratin, mixRgb(c.back, c.tip, 0.3)),
    res,
    color: spec.colours.coat,
    mirror: b.mirror,
    tone: { reach: res * 5, ground: b.height * 0.35, strength: 0.75, edge: 0.15, ...strands },
    paint,
    detail: lod === 0 ? detailBoxes(b, res) : [],
    ...(rel && !hero ? { relief: rel } : {}),
    ...(o.strip ? { strip: o.strip } : {}),
  });
  const body = piece.mesh;
  // LOD2 legs carry no baked cavity tone: darken them to the shaded value of the sculpted legs.
  const tubes = lod === 2 ? legTubes(b, (q) => v3.mul(paint(q, spec.colours.coat), 0.82)) : null;
  const names = {
    body: `${p}body`,
    head: `${p}head`,
    jaw: `${p}jaw`,
    eyeL: `${p}eye_l`,
    eyeR: `${p}eye_r`,
  };
  const bodyMesh = rig.body(tubes ? merge([body, tubes]) : body);
  const bodySrc = { field: heroField(piece.field, rel, surface, res0), color: piece.color };
  ctx.part(names.body, heroTag(bodyMesh, hero, bodySrc), { density: bio.density });
  // Strand cards over the sculpted coat (creature-fur.ts; LOD0/1, fur only; `cards: false` = off).
  if (spec.cards !== false) {
    const fur = creatureFur(body, b, spec, {
      lod,
      rng: ctx.rng.fork('fur'),
      field: piece.field,
    });
    if (fur)
      ctx.part(`${p}fur`, rig.pieces(fur.mesh, 'body', [0, 0, 0]), {
        surface: 'cutout',
        ...HAIR_PHYSICS,
      });
  }

  // Head: sculpted level in its own frame, pitched about the atlas.
  const hp = headPaint(b, spec);
  const eyeC = l.eye.centre;
  // LOD2: no eyeballs; a dark painted eye where the orbit is.
  const headColour =
    lod === 2
      ? (q: Vec3, col: Vec3): Vec3 =>
          mixRgb(
            hp(q, col),
            [0.03, 0.025, 0.02],
            smoothstep(
              l.eye.r * 1.6,
              l.eye.r * 0.9,
              v3.len(v3.sub([q[0], Math.abs(q[1]), q[2]], eyeC)),
            ),
          )
      : hp;
  const headPiece = sculptPiece({
    edits: lod === 2 ? [...he.edits, ...he.jaw] : he.edits,
    res: hres,
    color: spec.colours.coat,
    mirror: true,
    tone: { reach: hres * 5, strength: 0.75, edge: 0.15, ...strands },
    paint: headColour,
    detail: lod === 0 ? headDetail(l, hres) : [],
    ...(o.strip ? { strip: o.strip } : {}),
  });
  const headMesh = headPiece.mesh;
  const local: Mesh = he.teeth ? merge([headMesh, he.teeth]) : headMesh;
  const headPart = rig.head(place(local, { pitch: h.pitch }), lod);
  const tagged = heroTag(headPart, hero, pitchedSource(headPiece, h.pitch, [0, 0, 0], headMesh));
  ctx.part(names.head, tagged, { at: h.atlas, density: bio.density });
  // Head fur in the head's own frame, turning with it (creature-head-fur.ts; bare nose, lips, eyes).
  if (spec.cards !== false) {
    const hf = creatureHeadFur(
      headMesh,
      spec,
      {
        nose: l.nose,
        noseR: l.rt,
        eye: eyeC,
        eyeR: l.eye.r,
        lips: l.zm,
        muzzle: l.lc,
        ...(l.ear ? { ears: l.ear[2] - l.earHeight * 0.1 } : {}),
      },
      { lod, rng: ctx.rng.fork('head-fur'), field: headPiece.field },
    );
    if (hf)
      ctx.part(`${p}head_fur`, rig.pieces(place(hf, { pitch: h.pitch }), 'head', h.atlas), {
        parent: names.head,
        surface: 'cutout',
        ...HAIR_PHYSICS,
      });
  }
  // Lower jaw: its own part under the head, pivoting at the hinge (mouth-open clips rotate it).
  // LOD2: the coarse cell cannot hold a separate thin jaw; it stays in the head.
  if (lod < 2) {
    const jawPiece = sculptPiece({
      edits: he.jaw,
      res: hres,
      color: spec.colours.coat,
      mirror: true,
      tone: { reach: hres * 5, strength: 0.75, edge: 0.15, ...strands },
      paint: headColour,
      ...(o.strip ? { strip: o.strip } : {}),
    });
    const pivot = v3.sub(headToWorld(h, hinge), h.atlas);
    const back = v3.mul(pivot, -1);
    const jawLocal = place(place(jawPiece.mesh, { pitch: h.pitch }), { at: back });
    const jawMesh = heroTag(
      rig.rigid(jawLocal, 'jaw'),
      hero,
      pitchedSource(jawPiece, h.pitch, back),
    );
    ctx.part(names.jaw, jawMesh, {
      at: pivot,
      parent: names.head,
      density: bio.density,
      connect: { as: 'hinge', to: names.head },
    });
  }
  for (const bone of arm) ctx.bone(bone.name, bone);

  if (lod < 2) {
    const ball = eyeball(l.eye, (l.eye.r / (lod === 0 ? 6 : 3)) * (hero ? HERO_CELL.eye : 1));
    for (const [name, side] of [
      [names.eyeL, 1],
      [names.eyeR, -1],
    ] as const) {
      const at: Vec3 = [eyeC[0], eyeC[1] * side, eyeC[2]];
      // The layout's gaze is the left eye's; the right eye looks at its mirror image.
      const g = l.eye.gaze ?? [eyeC[0] + 2, 0, eyeC[2]];
      const gaze: Vec3 = [g[0], g[1] * side, g[2]];
      const yaw = Math.atan2(gaze[1] - at[1], gaze[0] - at[0]);
      ctx.part(name, rig.rigid(place(place(ball, { yaw }), { pitch: h.pitch }), 'head'), {
        at: headToWorld(h, at),
        density: 1000,
      });
    }
  }
  const claws = clawMesh(b, lod, [
    mixRgb(c.keratin, [0.1, 0.08, 0.07], 0.3),
    c.keratin,
    mixRgb(c.keratin, [0.85, 0.82, 0.75], 0.35),
  ]);
  const clawName = claws ? `${p}claws` : null;
  if (claws && clawName)
    ctx.part(clawName, rig.pieces(claws, 'body', [0, 0, 0]), {
      connect: { as: 'grown', to: names.body },
      density: 1300,
    });
  return { bones: b, head: l, biology: bio, parts: { ...names, claws: clawName } };
}

/** A creature asset: defineAsset + kind, creases, biology checks and art defaults filled in. */
export interface CreatureDefinition extends Omit<AssetDefinition, 'kind' | 'build' | 'budget'> {
  readonly spec: CreatureSpec;
  readonly options?: CreatureOptions;
  readonly budget?: Budget;
  /** Extra parts after the creature (props, saddles, sockets). */
  readonly extra?: (ctx: BuildContext, info: CreatureInfo) => void;
}

export function defineCreature(d: CreatureDefinition): Asset {
  const { spec, options, extra, ...rest } = d;
  const { bones } = creaturePlan(spec);
  return defineAsset({
    ...rest,
    kind: 'creature',
    budget: d.budget ?? { triangles: [150000, 40000, 4000] },
    creases: [...creatureCreases(spec, options?.prefix), ...(d.creases ?? [])],
    checks: [balanced, ...foreShareCheck(spec, bones), ...(d.checks ?? [])],
    art: d.art ?? { focal: `${options?.prefix ?? ''}head`, grounded: true },
    clips: [...creatureClips(bones, spec, options?.prefix ?? ''), ...(d.clips ?? [])],
    build(ctx) {
      const hero = d.budget?.heroTextures !== undefined;
      const info = creature(ctx, spec, hero ? { ...options, hero } : options);
      extra?.(ctx, info);
    },
  });
}
