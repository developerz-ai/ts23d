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
import { armatureOf, type Bones, headToWorld } from './creature-bones.ts';
import { bodyPaint, headPaint, palette } from './creature-coat.ts';
import { creatureCreases } from './creature-creases.ts';
import { mixRgb, smoothstep, v3 } from './creature-curve.ts';
import { detailBoxes, headDetail } from './creature-detail.ts';
import { eyeball } from './creature-eye.ts';
import { clawMesh } from './creature-feet.ts';
import { creatureFur } from './creature-fur.ts';
import { type HeadLayout, headEdits } from './creature-head.ts';
import { creatureHeadFur } from './creature-head-fur.ts';
import { legTubes } from './creature-limbs.ts';
import { sculptPiece } from './creature-mesh.ts';
import { bonesOf } from './creature-skeleton.ts';
import { jawHinge } from './creature-skull.ts';
import { type CreatureSpec, checkCreature } from './creature-spec.ts';
import { relief } from './creature-surface.ts';

export interface CreatureOptions {
  /** Part-name prefix (`wolf_` → `wolf_body`, `wolf_head` …). Default none. */
  readonly prefix?: string;
  /** Trim-sheet strip of the skin/coat (e.g. a neutral fur strip registered by the recipe). */
  readonly strip?: StripId;
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

/** Cell growth per LOD: legged bodies (legs become tubes at LOD2) and legless ones. */
const LOD_SCALE = [1, 2.2, 6.5] as const;
const LOD_SCALE_LEGLESS = [1, 2, 3.5] as const;
const HEAD_RES = [0.017, 0.033, 0.11] as const;

/** Body sculpt cell at LOD0, metres. */
export function bodyRes(b: Bones): number {
  return Math.max(0.0025, b.limbR > 0 ? b.limbR * 0.165 : b.height * 0.06);
}

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
  const res = bodyRes(b) * (b.legs.length > 0 ? LOD_SCALE : LOD_SCALE_LEGLESS)[lod];
  const surface = spec.surface ?? 'fur';
  const paint = bodyPaint(b, spec, Math.min(res * 0.6, (spec.pattern?.scale ?? 1) * 0.12));
  // LOD0: the skin's relief. LOD2: coarse cells cut convex curves short — grow the shell back by
  // ~⅕ cell, fading to nothing at the soles so the feet stay on z = 0.
  const grow = res * 0.2;
  const rel =
    lod === 0
      ? relief(surface, res, Math.max(res * 4, b.height * 0.04), 7)
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
    ...(rel ? { relief: rel } : {}),
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
  ctx.part(names.body, tubes ? merge([body, tubes]) : body, { density: bio.density });
  // Strand cards over the sculpted coat (creature-fur.ts; LOD0/1, fur only; `cards: false` = off).
  if (spec.cards !== false) {
    const fur = creatureFur(body, b, spec, { lod, rng: ctx.rng.fork('fur'), field: piece.field });
    if (fur) ctx.part(`${p}fur`, fur.mesh, { surface: 'cutout', ...HAIR_PHYSICS });
  }

  // Head: sculpted level in its own frame, pitched about the atlas.
  const h = b.head;
  const hres = h.length * HEAD_RES[lod];
  const he = headEdits(b, spec, lod, hres);
  const l = he.layout;
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
  ctx.part(names.head, place(local, { pitch: h.pitch }), { at: h.atlas, density: bio.density });
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
      ctx.part(`${p}head_fur`, place(hf, { pitch: h.pitch }), {
        parent: names.head,
        surface: 'cutout',
        ...HAIR_PHYSICS,
      });
  }
  // Lower jaw: its own part under the head, pivoting at the hinge (mouth-open clips rotate it).
  // LOD2: the coarse cell cannot hold a separate thin jaw; it stays in the head.
  const [hx, , hz] = jawHinge(l);
  const hinge: Vec3 = [hx, 0, hz];
  if (lod < 2) {
    const jawMesh = sculptPiece({
      edits: he.jaw,
      res: hres,
      color: spec.colours.coat,
      mirror: true,
      tone: { reach: hres * 5, strength: 0.75, edge: 0.15, ...strands },
      paint: headColour,
      ...(o.strip ? { strip: o.strip } : {}),
    }).mesh;
    const pivot = v3.sub(headToWorld(h, hinge), h.atlas);
    ctx.part(names.jaw, place(place(jawMesh, { pitch: h.pitch }), { at: v3.mul(pivot, -1) }), {
      at: pivot,
      parent: names.head,
      density: bio.density,
      connect: { as: 'hinge', to: names.head },
    });
  }
  const chin = headToWorld(h, [l.L - l.rt * 2.2, 0, l.zt - l.rt * 0.85]);
  for (const bone of armatureOf(b, [headToWorld(h, hinge), chin], p)) ctx.bone(bone.name, bone);

  if (lod < 2) {
    const ball = eyeball(l.eye, l.eye.r / (lod === 0 ? 6 : 3));
    for (const [name, side] of [
      [names.eyeL, 1],
      [names.eyeR, -1],
    ] as const) {
      const at: Vec3 = [eyeC[0], eyeC[1] * side, eyeC[2]];
      // The layout's gaze is the left eye's; the right eye looks at its mirror image.
      const g = l.eye.gaze ?? [eyeC[0] + 2, 0, eyeC[2]];
      const gaze: Vec3 = [g[0], g[1] * side, g[2]];
      const yaw = Math.atan2(gaze[1] - at[1], gaze[0] - at[0]);
      ctx.part(name, place(place(ball, { yaw }), { pitch: h.pitch }), {
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
    ctx.part(clawName, claws, { connect: { as: 'grown', to: names.body }, density: 1300 });
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
    build(ctx) {
      const info = creature(ctx, spec, options);
      extra?.(ctx, info);
    },
  });
}
