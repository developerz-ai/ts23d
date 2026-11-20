// QA `model` (plan 2026/11/16/101 slice 07): a model-built body (a skinned part with its own
// texture set, ADR 016) really is the animal on its skeleton. Per such part:
//   texture  — the albedo under the mesh's UVs is not blank: luminance standard deviation over
//              the triangles' centre texels ≥ TEXTURE_STD (T3D_MODEL_TEXTURE)
//   skeleton — every bone's head (helpers aside) lies inside the mesh (T3D_MODEL_SKELETON)
//   fit      — no copy of the skeleton turned a quarter or half a turn hugs the surface clearly
//              better (hugTurn ≤ FIT_TURN; T3D_MODEL_FIT: a wrong yaw leaves a turned copy the
//              better fit; a wrong scale or place leaves joints outside: `skeleton`)
//   doubled  — one head outline, one leg outline per foot (model-doubled.ts; T3D_MODEL_DOUBLED)
//   ground   — each foot bone's skin reaches the ground: its lowest vertex within GROUND of
//              z = 0 (T3D_MODEL_FIT); a water asset (`medium: 'water'`) has no ground and no feet
// Thresholds were measured on the Pixal3D wolf (model.test.ts has the numbers).

import type { Armature, Bone, CompiledAsset, Mesh, Part, Vec3 } from '../core/index.ts';
import { dmath, worldMeshes } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { triBvh } from '../primitives/index.ts';
import { MID_SUFFIX } from './deform.ts';
import { feetOf } from './gait.ts';
import { doubledFeatures } from './model-doubled.ts';
import { FIT_SPAN, FIT_TURN, hugTurn, segment, skeletonSpan } from './model-hug.ts';
import type { Finding, Gate } from './types.ts';

/** Least luminance standard deviation (0..255 scale) of a baked albedo. Wolf: 54; a flat
 *  colour: 0; a failed bake (black with noise): < 3. */
export const TEXTURE_STD = 6;
/** How far a foot's lowest skin may be from z = 0, metres. Wolf: ≤ 0.0012 on all four paws at every LOD. */
export const GROUND = 0.01;
/** …or this share of the skeleton's height when that is more (the wolf's 0.84 m: 1.0 cm). */
export const GROUND_SHARE = 0.012;

const finding = (code: string, part: string, message: string, fix: string): Finding => ({
  gate: 'model',
  code,
  part,
  message: `${code} ${message}`,
  fix,
});

const stds = new WeakMap<Uint8Array, WeakMap<Float32Array, number>>();

/** Luminance standard deviation of the albedo at each triangle's centre UV (0..255). */
export function albedoSpread(albedo: Uint8Array, mesh: Mesh): number {
  const seen = stds.get(albedo)?.get(mesh.uvs);
  if (seen !== undefined) return seen;
  const img = decodePng(albedo);
  let [n, sum, sq] = [0, 0, 0];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    let [u, v] = [0, 0];
    for (let k = 0; k < 3; k++) {
      const i = (mesh.indices[t + k] ?? 0) * 2;
      u += (mesh.uvs[i] ?? 0) / 3;
      v += (mesh.uvs[i + 1] ?? 0) / 3;
    }
    const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)));
    const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)));
    const at = (y * img.width + x) * 4;
    const l =
      0.2126 * (img.data[at] ?? 0) +
      0.7152 * (img.data[at + 1] ?? 0) +
      0.0722 * (img.data[at + 2] ?? 0);
    [n, sum, sq] = [n + 1, sum + l, sq + l * l];
  }
  const std = n ? Math.sqrt(Math.max(0, sq / n - dmath.pow(sum / n, 2))) : 0;
  const per = stds.get(albedo) ?? new WeakMap<Float32Array, number>();
  per.set(mesh.uvs, std);
  stds.set(albedo, per);
  return std;
}

/** Lowest vertex (asset z) under a foot bone: within one bone length of it in plan view and
 *  nearer to it than to any of the `others` (the other feet: a neighbour 14 cm away is inside a
 *  39 cm leg's radius, and its paw on the ground must not vouch for this one in the air). */
export function lowestSkin(
  mesh: Mesh,
  at: Vec3,
  bone: Bone,
  others: readonly Bone[] = [],
): number | null {
  const reach = dmath.hypot(
    bone.tail[0] - bone.head[0],
    bone.tail[1] - bone.head[1],
    bone.tail[2] - bone.head[2],
  );
  const [a, b]: [Vec3, Vec3] = [
    [bone.head[0], bone.head[1], 0],
    [bone.tail[0], bone.tail[1], 0],
  ];
  const rivals = others
    .filter((o) => o !== bone)
    .map((o): [Vec3, Vec3] => [
      [o.head[0], o.head[1], 0],
      [o.tail[0], o.tail[1], 0],
    ]);
  let low: number | null = null;
  const P = mesh.positions;
  for (let v = 0; v < P.length / 3; v++) {
    const p: Vec3 = [(P[v * 3] ?? 0) + at[0], (P[v * 3 + 1] ?? 0) + at[1], 0];
    const d = segment(p, a, b);
    if (d > reach || rivals.some(([ra, rb]) => segment(p, ra, rb) < d)) continue;
    low = Math.min(low ?? Infinity, (P[v * 3 + 2] ?? 0) + at[2]);
  }
  return low;
}

const ZERO: Vec3 = [0, 0, 0];

/** `mesh` is the part's WORLD mesh (its whole parent chain applied): bones are asset-frame. */
function partFindings(p: Part, mesh: Mesh, sk: Armature | undefined, water: boolean): Finding[] {
  const out: Finding[] = [];
  const std = p.textures ? albedoSpread(p.textures.albedo, mesh) : 0;
  if (!(std >= TEXTURE_STD))
    out.push(
      finding(
        'T3D_MODEL_TEXTURE',
        p.name,
        `part '${p.name}' albedo is blank under its UVs: luminance spread ${std.toFixed(1)} of 255 (≥ ${TEXTURE_STD})`,
        "re-run the Blender bake: albedo is baked as EMIT from the source's base colour (a DIFFUSE bake of a metallic source is black); check the report's hitRate ≥ 0.98 and that `uv` ran before `bake`",
      ),
    );
  if (!sk || !mesh.joints) return out;
  const bvh = triBvh(mesh);
  const outside = sk.bones
    .filter((b) => !b.name.endsWith(MID_SUFFIX) && !(bvh.winding(b.head) > 0.5))
    .map((b) => b.name);
  if (outside.length)
    out.push(
      finding(
        'T3D_MODEL_SKELETON',
        p.name,
        `part '${p.name}': ${outside.length} joint(s) lie outside the mesh: ${outside.slice(0, 6).join(', ')}${outside.length > 6 ? ', …' : ''}`,
        'fit the skeleton into the mesh (kinds `modelBody` / `fitSkeleton` do), or correct the spec so the plan has the limbs the model has',
      ),
    );
  // Scale: the yaw comparison below cannot see a skeleton shrunk inside its body (every joint
  // inside, equally far from the skin at every turn), so the skeleton must also reach along the
  // body's longest side.
  const span = skeletonSpan(mesh, sk);
  if (!(span >= FIT_SPAN))
    out.push(
      finding(
        'T3D_MODEL_FIT',
        p.name,
        `part '${p.name}': the skeleton reaches ${(span * 100).toFixed(0)} % of the body's longest side (≥ ${FIT_SPAN * 100} %): the mesh and the skeleton are not at one scale`,
        "register the model first (kinds `modelFit` or `register: 'joints'`): scale, then fit the skeleton",
      ),
    );
  const hug = hugTurn(mesh, ZERO, sk);
  if (!(hug <= FIT_TURN))
    out.push(
      finding(
        'T3D_MODEL_FIT',
        p.name,
        `part '${p.name}': a copy of the skeleton turned a quarter or half a turn hugs the surface better (${hug.toFixed(2)}× the distance as it stands, ≤ ${FIT_TURN}×): the mesh is not registered to the skeleton`,
        'register the model first (kinds `modelFit`: yaw, scale and place), then fit the skeleton; a model facing sideways or at another scale lands here',
      ),
    );
  for (const d of doubledFeatures(mesh, ZERO, sk, water ? 'water' : undefined))
    out.push(
      finding(
        'T3D_MODEL_DOUBLED',
        p.name,
        `part '${p.name}': ${d.what} shows ${d.found} separate outline(s), expected ${d.expected}: a doubled or missing feature`,
        'the mesh was mirrored across a plane that is not its sagittal plane (two muzzles), or a far-side limb was left on it: repose the model before mirroring (kinds modelRig `repose`), drop `symmetric`, or re-roll the concept as an exact side profile',
      ),
    );
  // A swimmer has no ground to stand on (as in `gait`): its low leaf bones are not feet.
  const feet = water ? [] : feetOf(sk);
  // 1 cm on a wolf-sized body, the same share of a larger one (a 2 m dragon: 2.4 cm).
  const height = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  const ground = Math.max(GROUND, height * GROUND_SHARE);
  for (const foot of feet) {
    const low = lowestSkin(mesh, ZERO, foot, feet);
    if (low !== null && Math.abs(low) <= ground) continue;
    out.push(
      finding(
        'T3D_MODEL_FIT',
        p.name,
        low === null
          ? `part '${p.name}': no skin under foot bone '${foot.name}'`
          : `part '${p.name}': the skin of foot '${foot.name}' ends ${(low * 100).toFixed(1)} cm from the ground (± ${(ground * 100).toFixed(1)} cm)`,
        'put the lowest vertex of every foot on z = 0 (kinds `modelFit` grounds the mesh; a paw held up in the concept needs a re-roll in a square stand)',
      ),
    );
  }
  return out;
}

/** Every skinned or unskinned part that carries its own texture set. */
export const model: Gate = (asset: CompiledAsset) => {
  const world = worldMeshes(asset.parts);
  return asset.parts.flatMap((p) => {
    const mesh = world.get(p.name);
    return p.textures && mesh
      ? partFindings(p, mesh, asset.skeleton, asset.medium === 'water')
      : [];
  });
};
