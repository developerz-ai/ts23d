// riggedBody: a rigged, textured model as a character, taken as it is (the humanoid path of plan
// 2026/11/16/101: the model's own skin, armature and clips; no skeleton fitting and no
// CreatureSpec, unlike modelBody). The LOD being compiled becomes ONE skinned part with the
// model's texture set (ADR 016). Its bones are declared minus the rig's helper leaves: a leaf bone
// no clip moves is rigid with its parent, so its weights fold into the parent exactly (a hosted
// rig's `headfront` sits in front of the chin, outside the mesh, and would fail QA `skin`). Its
// clips are picked and renamed, optionally lifted (`lift`: a root-height correction per clip,
// what QA `gait` asks for when a foot's skin goes under the floor). Density is derived so the
// closed mesh weighs the sourced mass.

import { type Bone, type BuildContext, type Clip, type Mesh, Ts23dError } from '../core/index.ts';
import type { ImportedModel } from '../neural/index.ts';
import { meshVolume } from './model-body.ts';
import { liftClip, onBones } from './model-character-clips.ts';

export interface RiggedBodyOptions {
  readonly model: ImportedModel;
  /** Part name. */
  readonly name: string;
  /** Whole-figure mass, kg. */
  readonly mass: number;
  /** Model clip name → asset clip name; a clip not listed is dropped, a listed one must exist. */
  readonly clips: Readonly<Record<string, string>>;
  /** Asset clips that must loop: one that did not import as a closed loop is refused. */
  readonly loop?: readonly string[];
  /** Asset clip name → metres added to the root's height through the whole clip. */
  readonly lift?: Readonly<Record<string, number>>;
  /** Bone renames, model name (as importModel spells it) → asset name. */
  readonly boneNames?: Readonly<Record<string, string>>;
}

export interface RiggedBody {
  readonly part: string;
  readonly bones: readonly Bone[];
  readonly clips: readonly Clip[];
  /** Helper leaves folded into their parents (model names). */
  readonly folded: readonly string[];
  /** kg/m³ that makes this LOD's mesh weigh `mass`. */
  readonly density: number;
}

const refuse = (cause: string, fix: string): never => {
  throw new Ts23dError('T3D_MODEL_SKELETON', { cause: `riggedBody: ${cause}`, fix });
};

/** For each bone, the bone its weights go to: itself, or the nearest kept ancestor of a leaf
 *  that no clip moves (found from the tips inward, so a chain of helpers folds whole). */
export function foldTargets(bones: readonly Bone[], clips: readonly Clip[]): Map<string, string> {
  const moved = new Set(
    clips.flatMap((c) => c.tracks.flatMap((t) => ('bone' in t ? [t.bone] : []))),
  );
  const kept = new Set(bones.map((b) => b.name));
  for (let again = true; again; ) {
    again = false;
    const parents = new Set(bones.filter((b) => kept.has(b.name)).map((b) => b.parent));
    for (const b of bones)
      if (kept.has(b.name) && !parents.has(b.name) && !moved.has(b.name) && b.parent) {
        kept.delete(b.name);
        again = true;
      }
  }
  const byName = new Map(bones.map((b) => [b.name, b]));
  return new Map(
    bones.map((b) => {
      let at: Bone = b;
      while (!kept.has(at.name)) at = byName.get(at.parent ?? '') ?? at;
      return [b.name, at.name];
    }),
  );
}

/** The mesh's joints re-indexed from `from` bones onto `to` names; slots that land on one bone
 *  are summed into the first, the freed slot repeating it at weight 0. */
function reindex(
  mesh: Mesh,
  from: readonly Bone[],
  target: Map<string, string>,
  to: readonly string[],
): Mesh {
  const index = new Map(to.map((n, i) => [n, i]));
  const joints = Uint16Array.from(
    mesh.joints ?? [],
    (j) => index.get(target.get(from[j]?.name ?? '') ?? '') ?? 0,
  );
  const weights = Float32Array.from(mesh.weights ?? []);
  for (let v = 0; v < joints.length; v += 4)
    for (let a = 1; a < 4; a++)
      for (let b = 0; b < a; b++)
        if (joints[v + a] === joints[v + b] && (weights[v + a] ?? 0) > 0) {
          weights[v + b] = (weights[v + b] ?? 0) + (weights[v + a] ?? 0);
          weights[v + a] = 0;
          joints[v + a] = joints[v] ?? 0;
          break;
        }
  return { ...mesh, joints, weights };
}

const built = new WeakMap<Mesh, Mesh>();

export function riggedBody(ctx: BuildContext, o: RiggedBodyOptions): RiggedBody {
  const { model } = o;
  const source = model.lods[Math.min(ctx.lod, model.lods.length - 1)];
  const all = model.armature?.bones ?? [];
  if (!source?.joints || !all.length || !model.textures)
    return refuse(
      `the model has ${model.lods.length} LOD(s), ${all.length} bone(s) and ${model.textures ? 'a' : 'no'} texture set`,
      "import a Blender steps output with `uv`, `bake`, `bind from: 'source'`, `lods` and `export`",
    );
  const picked = Object.entries(o.clips).map(([from, name]): Clip => {
    const clip = model.clips.find((c) => c.name === from);
    return clip
      ? { ...clip, name }
      : refuse(
          `the model has no clip '${from}' (it has ${model.clips.map((c) => `'${c.name}'`).join(', ') || 'none'})`,
          'name the clips the rig request asked for, as importModel spells them (snake_case)',
        );
  });
  for (const name of [...(o.loop ?? []), ...Object.keys(o.lift ?? {})])
    if (!picked.some((c) => c.name === name))
      refuse(
        `\`loop\` / \`lift\` name a clip '${name}' the asset does not have (${picked.map((c) => `'${c.name}'`).join(', ')})`,
        'use the asset clip names (the values of `clips`)',
      );
  for (const c of picked)
    if (o.loop?.includes(c.name) && !c.loop)
      refuse(
        `clip '${c.name}' must loop but its last key is not its first, and it is not a cycle one frame short of its period (importModel closes those)`,
        'pick a looping clip from the rig service, or drop it from `loop` and ship it as a one-shot',
      );
  const target = foldTargets(all, picked);
  const rename = o.boneNames ?? {};
  const called = (n: string): string => rename[n] ?? n;
  const keptBones = all.filter((b) => target.get(b.name) === b.name);
  const kept = new Set(keptBones.map((b) => b.name));
  const bones = keptBones.map(
    (b): Bone => ({
      ...b,
      name: called(b.name),
      ...(b.parent ? { parent: called(b.parent) } : {}),
    }),
  );
  let mesh = built.get(source);
  if (!mesh) {
    mesh = reindex(
      source,
      all,
      target,
      keptBones.map((b) => b.name),
    );
    built.set(source, mesh);
  }
  for (const bone of bones) ctx.bone(bone.name, bone);
  const density = o.mass / Math.max(meshVolume(mesh), 1e-9);
  ctx.part(o.name, mesh, { density, textures: model.textures });
  const root = bones.find((b) => b.parent === undefined)?.name ?? '';
  return {
    part: o.name,
    bones,
    clips: picked.map((c) => liftClip(onBones(c, kept, rename), root, o.lift?.[c.name] ?? 0)),
    folded: all.filter((b) => !kept.has(b.name)).map((b) => b.name),
    density,
  };
}
