// modelBody: a creature whose surface is a model's mesh, kept whole with its own textures (ADR
// 016), and whose skeleton, motion, scale and mass are code. The imported LOD meshes (Blender
// steps output, any yaw and size) are registered to the plan (model-fit.ts), the plan's armature
// is fitted into LOD 0 (model-rig.ts), the LOD being compiled is skinned to it (model-bind.ts)
// and emitted as ONE textured part, with the bones and the density that makes the mesh weigh the
// sourced mass. After a two-pass modelChain the mesh arrives registered and, when the program
// had a `bind` step, with its own skin on these very bones: that skin is used as it is. v1 keeps the model's fused head: no jaw, eye or lid parts, so
// `bite` and `blink` are dropped (`info.dropped`), and no sockets are emitted (the creature kind
// has none either). `clips: 'model'` takes a rigged model as it is (its own skin, bones, clips).

import { type Bone, type BuildContext, type Clip, type Mesh, Ts23dError } from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import { MID, midTriples, splitMid } from './creature-helpers.ts';
import type { CreatureSpec } from './creature-spec.ts';
import { bindModel, quantiseWeights } from './model-bind.ts';
import type { ChainedModel } from './model-chain.ts';
import type { ExtraChains } from './model-extra.ts';
import { applyFit, type ModelFit } from './model-fit.ts';
import { mirrorHalf, without } from './model-mirror.ts';
import { type ModelRig, modelRig } from './model-rig.ts';
import type { FittedSkeleton } from './model-skeleton.ts';

export interface ModelBodyOptions {
  /** An import (registered and fitted here), or modelChain's result (already registered). */
  readonly model: ImportedModel | ChainedModel;
  readonly spec: CreatureSpec;
  /** Bone and part name prefix. Default none. */
  readonly prefix?: string;
  /** Part name. Default `modelBodyName(spec, prefix)`. */
  readonly name?: string;
  /** 'creature' (default): fit the plan's skeleton and bake its clips; 'model': the model's own
   *  skin, armature and clips, untouched (a rigged humanoid). */
  readonly clips?: 'creature' | 'model';
  /** Creature clips to leave out by name (e.g. ['gallop'] when the mesh cannot take the range). */
  readonly drop?: readonly string[];
  /** One pass only: fit a left/right symmetric skeleton (model-rig.ts). */
  readonly symmetric?: boolean | '+' | '-';
  /** One pass only: a rigger's armature for the model (its own frame), as the joint source. */
  readonly joints?: readonly Bone[];
  /** One pass only: bone chains the plan lacks (wings, fins; model-extra.ts). */
  readonly extra?: ExtraChains;
}

export interface ModelBodyInfo {
  readonly part: string;
  readonly bones: readonly Bone[];
  /** The clips for the asset's `clips` (defineModelCreature declares them). */
  readonly clips: readonly Clip[];
  /** Creature clips the fused head cannot play. */
  readonly dropped: readonly string[];
  /** Registration and skeleton fit; absent with `clips: 'model'`. */
  readonly fit?: ModelFit;
  readonly skeleton?: FittedSkeleton;
  /** Whose weights the part carries: the Blender output's own skin, or TS heat weights. */
  readonly skin?: 'model' | 'heat';
  /** kg/m³ that makes this LOD's mesh weigh `spec.mass`. */
  readonly density: number;
}

/** Enclosed volume of a closed mesh, m³ (signed tetrahedra; the absolute value). */
export function meshVolume(m: Mesh): number {
  const P = m.positions;
  let v = 0;
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => (m.indices[t + k] ?? 0) * 3) as [number, number, number];
    v +=
      (P[a] ?? 0) * ((P[b + 1] ?? 0) * (P[c + 2] ?? 0) - (P[b + 2] ?? 0) * (P[c + 1] ?? 0)) +
      (P[a + 1] ?? 0) * ((P[b + 2] ?? 0) * (P[c] ?? 0) - (P[b] ?? 0) * (P[c + 2] ?? 0)) +
      (P[a + 2] ?? 0) * ((P[b] ?? 0) * (P[c + 1] ?? 0) - (P[b + 1] ?? 0) * (P[c] ?? 0));
  }
  return Math.abs(v) / 6;
}

/** The body part's default name, shared with the `model_surface` crease (model-creature.ts):
 *  `<prefix>body_fur` for a furred spec (the path tracer shades a creature part named `body` as
 *  bare skin), else `<prefix>body`. */
export const modelBodyName = (spec: CreatureSpec, prefix = ''): string =>
  `${prefix}${(spec.surface ?? 'fur') === 'fur' ? 'body_fur' : 'body'}`;

const placed = new WeakMap<Float32Array, WeakMap<ModelRig, Mesh>>();
const skinned = new WeakMap<Float32Array, WeakMap<ModelRig, Mesh>>();

/** Largest distance a bone Blender bound to may sit from the bone TS fitted, metres. */
export const RIG_TOLERANCE = 0.001;

/**
 * Whether the import carries a skin for exactly this rig's bones (by name). A skin for these
 * names at other places means the committed output was made for another fit: T3D_MODEL_SKELETON.
 */
function ownsRig(mesh: Mesh, model: ImportedModel, rig: ModelRig): boolean {
  const from = model.armature?.bones;
  if (!from || !mesh.joints || !mesh.weights) return false;
  const byName = new Map(rig.bones.map((b) => [b.name, b]));
  const real = rig.bones.filter((b) => !b.name.endsWith(MID));
  if (!real.every((b) => from.some((f) => f.name === b.name))) return false;
  const unknown = from.filter((f) => !byName.has(f.name)).map((f) => f.name);
  if (unknown.length)
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: `modelBody: the Blender output's skin has ${unknown.length} bone(s) the fitted rig lacks: ${unknown.slice(0, 6).join(', ')}`,
      fix: 'declare them as `extra` chains (modelChain({ extra }): joints, parent, limits), or bind to the skeleton the chain sends and nothing else',
    });
  for (const f of from) {
    const b = byName.get(f.name) ?? f;
    const off = Math.hypot(f.head[0] - b.head[0], f.head[1] - b.head[1], f.head[2] - b.head[2]);
    if (off > RIG_TOLERANCE)
      throw new Ts23dError('T3D_MODEL_SKELETON', {
        cause: `modelBody: bone '${f.name}' of the Blender output is ${(off * 1000).toFixed(1)} mm from the skeleton fitted at build (≤ ${RIG_TOLERANCE * 1000} mm): the cached final pass was made for another fit`,
        fix: 'the proxy, the spec or the fitting code changed since the final pass ran: re-run `t3d neural run <recipe>` so the final pass is rebuilt for this fit',
      });
  }
  return true;
}

/** The imported skin re-indexed onto the rig's bones (by name), the helpers split off. */
function ownSkin(mesh: Mesh, model: ImportedModel, rig: ModelRig): Mesh {
  const index = new Map(rig.bones.map((b, i) => [b.name, i]));
  const from = model.armature?.bones ?? [];
  const joints = Uint16Array.from(mesh.joints ?? [], (j) => index.get(from[j]?.name ?? '') ?? 0);
  return splitMid(quantiseWeights({ ...mesh, joints }), midTriples(rig.bones));
}

export function modelBody(ctx: BuildContext, o: ModelBodyOptions): ModelBodyInfo {
  const { spec } = o;
  const chained: ChainedModel = 'lods' in o.model ? { model: o.model } : o.model;
  const { model } = chained;
  const p = o.prefix ?? '';
  const part = o.name ?? modelBodyName(spec, p);
  const source = model.lods[Math.min(ctx.lod, model.lods.length - 1)];
  const first = model.lods[0];
  if (!source || !first || !model.textures)
    throw new Ts23dError('T3D_MODEL_FIT', {
      cause: `modelBody: the model has ${model.lods.length} LOD mesh(es) and ${model.textures ? 'a' : 'no'} texture set`,
      fix: 'import the Blender steps output (uv + bake + lods + export) with importModel: it carries lod0..2 and PNG maps',
    });
  const textures = model.textures;
  const emit = (mesh: Mesh): number => {
    const density = spec.mass / Math.max(meshVolume(mesh), 1e-9);
    ctx.part(part, mesh, { density, textures });
    return density;
  };
  if (o.clips === 'model') {
    const bones = model.armature?.bones ?? [];
    if (!bones.length || !source.joints)
      throw new Ts23dError('T3D_MODEL_SKELETON', {
        cause: "modelBody: clips: 'model' needs a skinned model, this one has no armature",
        fix: "rig the model first (the `rig` task, or a Blender `bind` step), or use clips: 'creature'",
      });
    for (const bone of bones) ctx.bone(bone.name, bone);
    return { part, bones, clips: model.clips, dropped: [], density: emit(source) };
  }
  // Two passes: the mesh came back registered, for the rig the chain fitted on the proxy. One
  // pass: register and fit here, on LOD 0.
  const rig =
    chained.rig ??
    modelRig(first, spec, {
      prefix: p,
      ...(o.drop ? { drop: o.drop } : {}),
      ...(o.symmetric ? { symmetric: o.symmetric } : {}),
      ...(o.joints ? { joints: o.joints } : {}),
      ...(o.extra ? { extra: o.extra } : {}),
    });
  const once = <T>(memo: WeakMap<Float32Array, WeakMap<ModelRig, T>>, make: () => T): T => {
    const per = memo.get(source.positions) ?? new WeakMap<ModelRig, T>();
    memo.set(source.positions, per);
    if (!per.has(rig)) per.set(rig, make());
    return per.get(rig) as T;
  };
  const mesh = once(placed, () => {
    if (chained.rig) return source;
    const bare: Mesh = {
      positions: source.positions,
      normals: source.normals,
      uvs: source.uvs,
      colors: source.colors,
      indices: source.indices,
    };
    // One-pass symmetric: this LOD is mirrored as LOD 0 was for the fit (far legs off, the kept
    // half mirrored), so the mesh bound and emitted is the one the skeleton was fitted into.
    const placed = applyFit(bare, rig.fit.similarity);
    return rig.symmetric ? mirrorHalf(without(placed, rig.far.flat()), rig.side) : placed;
  });
  const own =
    chained.rig && ownsRig(source, model, rig)
      ? once(skinned, () => ownSkin(source, model, rig))
      : null;
  if (rig.target && !own)
    throw new Ts23dError('T3D_MODEL_SKELETON', {
      cause: 'modelBody: the rig is reposed but the Blender output carries no skin on its bones',
      fix: "end the program with { op: 'bind' }, { op: 'repose', to: rig.target } before lods and export, then re-run `t3d neural run <recipe>`",
    });
  for (const bone of rig.bones) ctx.bone(bone.name, bone);
  const density = emit(own ?? bindModel(mesh, rig.bones, rig.height, rig.skeleton.legs));
  return {
    part,
    bones: rig.bones,
    clips: rig.clips,
    dropped: rig.dropped,
    fit: rig.fit,
    skeleton: rig.skeleton,
    skin: own ? 'model' : 'heat',
    density,
  };
}
