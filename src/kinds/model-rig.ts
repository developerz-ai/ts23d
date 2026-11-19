// modelRig: everything TS derives from a model's geometry, once, from one mesh (the committed
// proxy shell in a two-pass chain, or LOD 0 of a single-pass import): the registration
// (model-fit.ts), the mesh in the asset frame, the plan's skeleton fitted into it
// (model-skeleton.ts), and the creature clips with the limits they need (model-clips.ts).
// `symmetric` is for a model made from an exact side-profile concept: its far side is invented,
// so the half nearer the plan is mirrored across y = 0 before the skeleton is fitted, and the
// joints are then forced exactly left/right symmetric (centre chains on y = 0). `side` says which
// half that was: the Blender `symmetrize` step takes it. Memoised per mesh and options.

import {
  type Bone,
  type Clip,
  isTs23dError,
  type Mesh,
  Ts23dError,
  type Vec3,
} from '../core/index.ts';
import { applySimilarity, triBvh } from '../primitives/index.ts';
import { creaturePlan } from './creature.ts';
import type { Bones } from './creature-bones.ts';
import { MID, midBones } from './creature-helpers.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { modelClips } from './model-clips.ts';
import { applyFit, FIT_LIMIT, type ModelFit, modelFit, shiftFit } from './model-fit.ts';
import { jointsFit } from './model-fit-joints.ts';
import { mapJoints, type RigChains } from './model-joints.ts';
import {
  MIRROR_LIMIT,
  type MirrorResidual,
  mirrorBones,
  mirrorHalf,
  mirrorResidual,
  moveY,
  nearerSide,
  tracedSkeleton,
  upperMiddle,
  without,
} from './model-mirror.ts';
import { reposeTarget } from './model-repose.ts';
import { legCapsules, limbsOf, type RigTail, tailOf } from './model-rig-limbs.ts';
import { type FittedSkeleton, fitSkeleton } from './model-skeleton.ts';

export { mirrorBones, mirrorHalf } from './model-mirror.ts';

export interface ModelRigOptions {
  readonly prefix?: string;
  /** Mirror one half and fit a symmetric skeleton: `true` picks the half nearer the plan, '+'
   *  (the animal's left) or '-' names the half the concept camera saw. */
  readonly symmetric?: boolean | '+' | '-';
  /** Declare the straightened, symmetric target rest (model-repose.ts) as the asset's skeleton:
   *  the Blender program must then `repose` to `rig.target` after `bind`. */
  readonly repose?: boolean;
  readonly drop?: readonly string[];
  /** About the yaw (degrees) that turns the model's front to +X, when the concept fixes it. */
  readonly front?: number;
  /** A rigger's armature for this mesh, in the mesh's own frame (model-joints.ts maps it). */
  readonly joints?: readonly Bone[];
  /** The chains the rigger's joints replace. Default all: ['trunk', 'fore', 'hind']. */
  readonly take?: readonly RigChains[];
  /** How the model is registered to the plan: on the surface (default; model-fit.ts) or from
   *  the rigger's `joints` (model-fit-joints.ts: for a body carrying what the plan does not,
   *  like raised wings). */
  readonly register?: 'surface' | 'joints';
  /** End the head bone at the nose (where it leaves the mesh) instead of at the plan's head
   *  length from the rigger's joint: for a model whose head is shorter than the spec's. */
  readonly nose?: boolean;
}

export interface ModelRig {
  readonly plan: Bones;
  /** The plan's height (shoulder height of a legged body), metres. */
  readonly height: number;
  readonly fit: ModelFit;
  /** The source mesh in the asset frame (mirrored when `symmetric`), unskinned. */
  readonly mesh: Mesh;
  readonly skeleton: FittedSkeleton;
  /** The bones as fitted into the generated mesh (no helpers): the `skeleton` Blender binds to. */
  readonly fitted: readonly Bone[];
  /** With `repose`: the target rest (the `repose` step's `to`) and how far each bone turns. */
  readonly target?: readonly { readonly name: string; readonly head: Vec3; readonly tail: Vec3 }[];
  readonly turns?: readonly { readonly bone: string; readonly degrees: number }[];
  /** With `symmetric`: how well the kept half's mirror image agreed with the rest, per region.
   *  `symmetric` is false when it did not (nothing was mirrored). */
  readonly mirror?: MirrorResidual;
  /** The armature to declare (the target rest with `repose`, else the fitted one): bones with
   *  clip-narrowed limits, then the helpers. */
  readonly bones: readonly Bone[];
  readonly clips: readonly Clip[];
  readonly dropped: readonly string[];
  /** The half nearer the plan (asset +y = left): the `symmetrize` step's `side`. */
  readonly side: '+' | '-';
  readonly symmetric: boolean;
  /** The limbs that are separate in the animal, as capsules (the free part of each leg from its
   *  traced centre line, the tail from its bones): the Blender `unweb` step's `limbs`. */
  readonly limbs: readonly (readonly { head: Vec3; tail: Vec3; r: number }[])[];
  /** The tail as the Blender `isolate` step's fields, in the fitted rest (the one Blender binds
   *  in): its bones past the croup, its tip, the cut across its root and its reach. Absent when
   *  the plan has no tail or none was traced. Use after `bind`: `{ op: 'isolate', ...rig.tail }`. */
  readonly tail?: RigTail;
  /** Symmetric only: the far side's free legs (the half that is thrown away), found on the
   *  unmirrored mesh. They may sit on the mirror plane: the Blender `amputate` step takes them
   *  off before `symmetrize`, as TS does before it mirrors. Empty when they could not be traced. */
  readonly far: readonly (readonly { head: Vec3; tail: Vec3; r: number }[])[];
  /** Where the joints came from: a rigger's armature mapped by topology, or the geometric fit
   *  (also when the rigger's was refused: `notices` then says why). */
  readonly joints: 'rig' | 'fit';
  readonly notices: readonly string[];
  /** A FITTED bone's head by unprefixed name (`head`, `fore_l_3`), for focus spheres and masks. */
  at(bone: string): Vec3;
}

const ids = new WeakMap<object, number>();
let nextId = 0;
const idOf = (o: object): number => {
  if (!ids.has(o)) ids.set(o, ++nextId);
  return ids.get(o) ?? 0;
};

const memo = new WeakMap<Float32Array, Map<string, ModelRig>>();

export function modelRig(source: Mesh, spec: CreatureSpec, o: ModelRigOptions = {}): ModelRig {
  const prefix = o.prefix ?? '';
  const key = `${o.joints ? idOf(o.joints) : ''}|${(o.take ?? []).join('+')}|${prefix}|${o.symmetric ?? false}|${o.repose === true}|${o.nose === true}|${o.register ?? 'surface'}|${o.front}|${(o.drop ?? []).join(',')}|${JSON.stringify(spec)}`;
  const seen = memo.get(source.positions)?.get(key);
  if (seen) return seen;
  if (o.register === 'joints' && !o.joints)
    throw new Ts23dError('T3D_RECIPE_INVALID', {
      cause:
        "modelRig: register: 'joints' registers the model from a rigger's armature, but no `joints` were given",
      fix: "pass the rigger's armature as `joints` (its bones in the mesh's own frame), or drop register: 'joints' to register on the surface",
    });
  const { bones: plan } = creaturePlan(spec);
  const byJoints = o.register === 'joints' && o.joints;
  const first = byJoints
    ? jointsFit(source, plan, byJoints, prefix)
    : modelFit(source, plan, o.front === undefined ? {} : { front: o.front });
  if (!byJoints && !(first.relative <= FIT_LIMIT))
    throw new Ts23dError('T3D_MODEL_FIT', {
      cause: `modelRig: the model sits ${(first.relative * 100).toFixed(1)} % of the plan's height off its flesh (median; limit ${FIT_LIMIT * 100} %)`,
      fix: "the model is not this animal in a standing pose: re-roll the concept (side-on, square stand), or correct the spec's proportions from the sources",
    });
  const bare: Mesh = {
    positions: source.positions,
    normals: source.normals,
    uvs: source.uvs,
    colors: source.colors,
    indices: source.indices,
  };
  // Symmetric: the sagittal plane runs midway between the left and right legs traced on the
  // unmirrored mesh (else through the middle of the upper body's width) and is moved onto y = 0.
  // The kept half is mirrored only if its mirror image agrees with the head, neck and trunk it
  // would replace (model-mirror.ts): a head off the plane must be reposed, never doubled.
  const rough = applyFit(bare, first.similarity);
  const pre = o.symmetric ? tracedSkeleton(rough, plan, prefix) : null;
  const lines = Object.values(pre?.legs ?? {}).flatMap((t) => t.line.map((l) => l[2]));
  const middle = !o.symmetric
    ? 0
    : lines.length
      ? lines.reduce((a, y) => a + y, 0) / lines.length
      : upperMiddle(rough, plan);
  const fit = o.symmetric ? shiftFit(first, -middle) : first;
  const placed = applyFit(bare, fit.similarity);
  const side = o.symmetric === '+' || o.symmetric === '-' ? o.symmetric : nearerSide(placed, plan);
  const shifted = (pre?.bones ?? []).map((b) => ({
    ...b,
    head: moveY(b.head, -middle),
    tail: moveY(b.tail, -middle),
  }));
  const residual = o.symmetric && pre ? mirrorResidual(placed, shifted, plan.height) : null;
  const mirrored = !!o.symmetric && (residual === null || residual.worst <= MIRROR_LIMIT);
  const far = mirrored
    ? Object.entries(pre?.legs ?? {}).flatMap(([stem, t]) =>
        stem.endsWith(side === '+' ? '_r' : '_l')
          ? [
              legCapsules(t).map((c) => ({
                ...c,
                head: moveY(c.head, -middle),
                tail: moveY(c.tail, -middle),
              })),
            ]
          : [],
      )
    : [];
  const mesh = mirrored ? mirrorHalf(without(placed, far.flat()), side) : placed;
  // Mirrored halves meet in a seam on y = 0, where the centre chains lie and the inside test is
  // a coin toss: the mirrored fit is not strict (QA `model` checks the joints in the final mesh).
  // Registered from a rigger's joints, the geometric fit is the fallback and the source of what
  // the rigger lacks: it need not pass its own strict checks (the mapped skeleton is checked).
  const found = fitSkeleton(mesh, plan, prefix, !mirrored && !byJoints);
  const real = (bones: readonly Bone[]): Bone[] => bones.filter((b) => !b.name.endsWith(MID));
  const geometric = mirrored ? mirrorBones(real(found.bones)) : real(found.bones);
  // A rigger's joints (o.joints: its armature in the source mesh's frame) replace the geometric
  // ones where its topology reads as this animal; else the geometric fit stands, with a notice.
  const notices: string[] = [];
  if (o.joints && mirrored)
    notices.push(
      "modelRig: the rigger's joints are not mapped onto a mirrored (symmetric) fit, whose joints are forced left/right symmetric: the geometric skeleton fit is used instead",
    );
  let fitted = geometric;
  if (o.joints && !mirrored) {
    const bvh = triBvh(mesh);
    const moved = o.joints.map((b) => ({
      ...b,
      head: applySimilarity(fit.similarity, b.head),
      tail: applySimilarity(fit.similarity, b.tail),
    }));
    try {
      fitted = mapJoints(
        geometric,
        moved,
        (p) => bvh.winding(p) > 0.5,
        prefix,
        o.take,
        o.nose === true,
      );
    } catch (e) {
      if (!isTs23dError(e) || e.code !== 'T3D_MODEL_SKELETON') throw e;
      notices.push(`${e.message}: the geometric skeleton fit is used instead`);
    }
  }
  const skeleton: FittedSkeleton = { ...found, bones: [...fitted, ...midBones(fitted, prefix)] };
  // Repose: the bones and clips the asset declares are the target rest's (model-repose.ts);
  // Blender binds in the fitted rest and poses the mesh to the target.
  const target = o.repose ? reposeTarget(fitted) : null;
  const rest = target ? [...target.bones, ...midBones(target.bones, prefix)] : skeleton.bones;
  const rig = modelClips(rest, prefix, o.drop);
  const heads = new Map(fitted.map((b) => [b.name, b.head]));
  const tail = tailOf(fitted, found.tailRadius, prefix);
  const out: ModelRig = {
    plan,
    height: plan.height,
    fit,
    mesh,
    skeleton,
    fitted,
    ...(target
      ? { target: target.bones.map((b) => ({ name: b.name, head: b.head, tail: b.tail })) }
      : {}),
    ...(target ? { turns: target.turns } : {}),
    bones: rig.bones,
    clips: rig.clips,
    dropped: rig.dropped,
    side,
    symmetric: mirrored,
    joints: fitted === geometric ? 'fit' : 'rig',
    notices,
    ...(residual ? { mirror: residual } : {}),
    limbs: limbsOf(skeleton, prefix),
    ...(tail ? { tail } : {}),
    far,
    at: (bone) => {
      const head = heads.get(`${prefix}${bone}`);
      if (head) return head;
      throw new Ts23dError('T3D_RECIPE_INVALID', {
        cause: `modelRig: the fitted skeleton has no bone '${prefix}${bone}'`,
        fix: `use one of: ${fitted.map((x) => x.name.slice(prefix.length)).join(', ')}`,
      });
    },
  };
  const per = memo.get(source.positions) ?? new Map<string, ModelRig>();
  per.set(key, out);
  memo.set(source.positions, per);
  return out;
}
