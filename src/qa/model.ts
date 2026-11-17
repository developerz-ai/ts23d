// QA `model` (plan 2026/11/16/101 slice 07): a model-built body (a skinned part with its own
// texture set, ADR 016) really is the animal on its skeleton. Per such part:
//   texture  — the albedo under the mesh's UVs is not blank: luminance standard deviation over
//              the triangles' centre texels ≥ TEXTURE_STD (T3D_MODEL_TEXTURE)
//   skeleton — every bone's head (helpers aside) lies inside the mesh (T3D_MODEL_SKELETON)
//   fit      — the surface hugs the skeleton: half its area is within FIT_MEDIAN of a bone,
//              as a share of the skeleton's height (T3D_MODEL_FIT; a wrong yaw or scale leaves
//              half the surface far from every bone)
//   doubled  — one head outline, one leg outline per foot (model-doubled.ts; T3D_MODEL_DOUBLED)
//   ground   — each foot bone's skin reaches the ground: its lowest vertex within GROUND of
//              z = 0 (T3D_MODEL_FIT)
// Thresholds were measured on the Pixal3D wolf (model.test.ts has the numbers).

import type { Armature, Bone, CompiledAsset, Mesh, Part, Vec3 } from '../core/index.ts';
import { worldMeshes } from '../core/index.ts';
import { decodePng } from '../material/index.ts';
import { triBvh } from '../primitives/index.ts';
import { MID_SUFFIX } from './deform.ts';
import { feetOf } from './gait.ts';
import { doubledFeatures } from './model-doubled.ts';
import type { Finding, Gate } from './types.ts';

/** Least luminance standard deviation (0..255 scale) of a baked albedo. Wolf: 54; a flat
 *  colour: 0; a failed bake (black with noise): < 3. */
export const TEXTURE_STD = 6;
/** Largest area-median surface → nearest bone distance ÷ skeleton height. Profile wolf, LOD 0–2:
 *  0.098–0.099 on the geometric fit's dorsal spine, 0.114–0.115 on a learned rigger's mid-trunk
 *  spine; 0.131–0.147 with the skeleton half a turn off, 0.41 a quarter turn off. */
export const FIT_MEDIAN = 0.125;
/** How far a foot's lowest skin may be from z = 0, metres. Wolf: ≤ 0.0012 on all four paws at every LOD. */
export const GROUND = 0.01;

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
  const std = n ? Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) : 0;
  const per = stds.get(albedo) ?? new WeakMap<Float32Array, number>();
  per.set(mesh.uvs, std);
  stds.set(albedo, per);
  return std;
}

const segment = (p: Vec3, a: Vec3, b: Vec3): number => {
  const u: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const t =
    l2 > 0
      ? Math.min(
          1,
          Math.max(0, ((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1] + (p[2] - a[2]) * u[2]) / l2),
        )
      : 0;
  return Math.hypot(p[0] - a[0] - u[0] * t, p[1] - a[1] - u[1] * t, p[2] - a[2] - u[2] * t);
};

/** Most triangles sampled for the hug (every n-th beyond that). */
const HUG_SAMPLES = 4000;

/**
 * Median distance from the part's surface to the nearest bone ÷ the skeleton's height. The
 * median is over AREA (triangle centroids weighted by triangle area), not over vertices: a mesh
 * decimated with more vertices kept on the head and paws read 0.142 / 0.132 / 0.112 by vertex on
 * LOD 0 / 1 / 2 of one wolf on one skeleton, and 0.115 on all three by area.
 */
export function skeletonHug(mesh: Mesh, at: Vec3, sk: Armature): number {
  const [P, T] = [mesh.positions, mesh.indices];
  const count = T.length / 3;
  const step = Math.max(1, Math.floor(count / HUG_SAMPLES));
  const d: [number, number][] = [];
  let total = 0;
  for (let t = 0; t < count; t += step) {
    const v = [0, 1, 2].map((k): Vec3 => {
      const i = (T[t * 3 + k] ?? 0) * 3;
      return [(P[i] ?? 0) + at[0], (P[i + 1] ?? 0) + at[1], (P[i + 2] ?? 0) + at[2]];
    }) as [Vec3, Vec3, Vec3];
    const [e, f] = [1, 2].map((j) => [0, 1, 2].map((k) => (v[j]?.[k] ?? 0) - (v[0][k] ?? 0))) as [
      number[],
      number[],
    ];
    const area =
      Math.hypot(
        (e[1] ?? 0) * (f[2] ?? 0) - (e[2] ?? 0) * (f[1] ?? 0),
        (e[2] ?? 0) * (f[0] ?? 0) - (e[0] ?? 0) * (f[2] ?? 0),
        (e[0] ?? 0) * (f[1] ?? 0) - (e[1] ?? 0) * (f[0] ?? 0),
      ) / 2;
    const centre: Vec3 = [
      (v[0][0] + v[1][0] + v[2][0]) / 3,
      (v[0][1] + v[1][1] + v[2][1]) / 3,
      (v[0][2] + v[1][2] + v[2][2]) / 3,
    ];
    d.push([Math.min(...sk.bones.map((b) => segment(centre, b.head, b.tail))), area]);
    total += area;
  }
  d.sort((a, b) => a[0] - b[0]);
  let seen = 0;
  let median = Number.POSITIVE_INFINITY;
  for (const [distance, area] of d) {
    seen += area;
    if (seen >= total / 2) {
      median = distance;
      break;
    }
  }
  const top = Math.max(...sk.bones.map((b) => Math.max(b.head[2], b.tail[2])));
  return median / Math.max(top, 1e-9);
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
  const reach = Math.hypot(
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
function partFindings(p: Part, mesh: Mesh, sk: Armature | undefined): Finding[] {
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
  const hug = skeletonHug(mesh, ZERO, sk);
  if (!(hug <= FIT_MEDIAN))
    out.push(
      finding(
        'T3D_MODEL_FIT',
        p.name,
        `part '${p.name}': half the surface is over ${(hug * 100).toFixed(1)} % of the skeleton's height from any bone (≤ ${FIT_MEDIAN * 100} %): the mesh is not registered to the skeleton`,
        'register the model first (kinds `modelFit`: yaw, scale and place), then fit the skeleton; a model facing sideways or at another scale lands here',
      ),
    );
  for (const d of doubledFeatures(mesh, ZERO, sk))
    out.push(
      finding(
        'T3D_MODEL_DOUBLED',
        p.name,
        `part '${p.name}': ${d.what} shows ${d.found} separate outline(s), expected ${d.expected}: a doubled or missing feature`,
        'the mesh was mirrored across a plane that is not its sagittal plane (two muzzles), or a far-side limb was left on it: repose the model before mirroring (kinds modelRig `repose`), drop `symmetric`, or re-roll the concept as an exact side profile',
      ),
    );
  const feet = feetOf(sk);
  for (const foot of feet) {
    const low = lowestSkin(mesh, ZERO, foot, feet);
    if (low !== null && Math.abs(low) <= GROUND) continue;
    out.push(
      finding(
        'T3D_MODEL_FIT',
        p.name,
        low === null
          ? `part '${p.name}': no skin under foot bone '${foot.name}'`
          : `part '${p.name}': the skin of foot '${foot.name}' ends ${(low * 100).toFixed(1)} cm from the ground (± ${GROUND * 100} cm)`,
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
    return p.textures && mesh ? partFindings(p, mesh, asset.skeleton) : [];
  });
};
