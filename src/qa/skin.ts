// QA `skin` (ADR 013): a skinned asset's weights are valid in every engine. Per skinned part:
// exactly 4 influences per vertex, weights finite, ≥ 0 and summing to 1 (± 1e-3: 0.98 fails),
// joint indices inside the skeleton; the part sits where bones can move it (no moving pivot above
// it); the bind pose reproduces the rest positions (≤ 1e-5 m). Over the asset: every bone drives
// some vertex, and the bones fit `budget.bones`; no paw carries both legs' weights (skin-sides.ts).

import {
  type Armature,
  type CompiledAsset,
  checkBoneBudget,
  checkMeshAttributes,
  type Part,
  SKIN_INFLUENCES,
  Ts23dError,
  toWorld,
  worldTransforms,
} from '../core/index.ts';
import { bindPoseError, inverseBind } from '../passes/index.ts';
import { crossedLimbFindings } from './skin-sides.ts';
import type { Finding, Gate } from './types.ts';

/** Largest bind-pose drift from the rest positions, metres. */
export const BIND_TOLERANCE = 1e-5;
/** Largest |Σw − 1| per vertex. */
export const SUM_TOLERANCE = 1e-3;

const finding = (message: string, fix: string, part?: string): Finding => ({
  gate: 'skin',
  code: 'T3D_SKIN_INVALID',
  ...(part ? { part } : {}),
  message: `T3D_SKIN_INVALID ${message}`,
  fix,
});

function partFindings(p: Part, sk: Armature | undefined, used: Set<number>): Finding[] {
  const m = p.mesh;
  if (!m?.joints || !m.weights) return [];
  if (!sk)
    return [
      finding(
        `part '${p.name}' is skinned but the asset has no skeleton`,
        'declare bones with ctx.bone, or drop the weights',
        p.name,
      ),
    ];
  const n = m.positions.length / 3;
  try {
    checkMeshAttributes(m, `part '${p.name}'`);
  } catch (e) {
    if (!(e instanceof Ts23dError)) throw e;
    return [finding(e.message.replace(/^T3D_[A-Z_]+:\s*/, ''), e.fix, p.name)];
  }
  let bad = -1;
  let oob = -1;
  for (let v = 0; v < n && bad < 0 && oob < 0; v++) {
    let sum = 0;
    for (let s = 0; s < SKIN_INFLUENCES; s++) {
      const w = m.weights[v * SKIN_INFLUENCES + s] ?? Number.NaN;
      const j = m.joints[v * SKIN_INFLUENCES + s] ?? 0;
      if (!(w >= 0)) bad = v;
      sum += w;
      if (w > 0 && j >= sk.bones.length) oob = v;
      if (w > 0) used.add(j);
    }
    if (!(Math.abs(sum - 1) <= SUM_TOLERANCE)) bad = v;
  }
  const out: Finding[] = [];
  if (bad >= 0) {
    const ws = [...m.weights.subarray(bad * 4, bad * 4 + 4)].map((w) => Math.round(w * 1e4) / 1e4);
    out.push(
      finding(
        `part '${p.name}' vertex ${bad} weights [${ws.join(', ')}] do not sum to 1`,
        'renormalise the 4 weights (skinWeights quantises to 1/255 so sums are exact)',
        p.name,
      ),
    );
  }
  if (oob >= 0)
    out.push(
      finding(
        `part '${p.name}' vertex ${oob} uses a joint outside the ${sk.bones.length}-bone skeleton`,
        'joints index the asset skeleton in ctx.bone order: declare the bones before weighting',
        p.name,
      ),
    );
  return out;
}

/** Skinned meshes must sit at the root: a moving pivot above them would move them twice. */
function placementFindings(asset: CompiledAsset): Finding[] {
  const byName = new Map(asset.parts.map((p) => [p.name, p]));
  return asset.parts.flatMap((p) => {
    if (!p.mesh?.joints) return [];
    for (
      let q = p.parent ? byName.get(p.parent) : undefined;
      q;
      q = q.parent ? byName.get(q.parent) : undefined
    )
      if (q.mesh === null || q.motion !== null)
        return [
          finding(
            `skinned part '${p.name}' sits under pivot '${q.name}'`,
            'parent skinned meshes to nothing (or to static parts): the bones move them',
            p.name,
          ),
        ];
    return p.motion
      ? [
          finding(
            `skinned part '${p.name}' has a motion`,
            'animate its bones with a clip instead',
            p.name,
          ),
        ]
      : [];
  });
}

/** The gate, with the inverse bind matrices the GLB writes (overridable to prove the check). */
export function skinFindings(asset: CompiledAsset, ibm?: Float32Array): Finding[] {
  const sk = asset.skeleton;
  const out: Finding[] = [];
  if (sk) {
    try {
      checkBoneBudget(asset.name, sk.bones.length, asset.budget.bones);
    } catch (e) {
      if (!(e instanceof Ts23dError)) throw e;
      out.push(finding(e.message.replace(/^T3D_[A-Z_]+:\s*/, ''), e.fix));
    }
  }
  const used = new Set<number>();
  const skinned = asset.parts.filter((p) => p.mesh?.joints);
  for (const p of skinned) out.push(...partFindings(p, sk, used));
  out.push(...placementFindings(asset));
  if (!sk || skinned.length === 0 || out.length) return out;
  const unused = sk.bones.filter((_, i) => !used.has(i)).map((b) => b.name);
  if (unused.length)
    out.push(
      finding(
        `LOD${asset.lod}: bones [${unused.join(', ')}] drive no vertex`,
        'drop the bones, or weight the flesh they carry (the bone set of skinWeights `only`)',
      ),
    );
  out.push(...crossedLimbFindings(asset));
  const bind = ibm ?? inverseBind(sk);
  const xf = worldTransforms(asset.parts);
  for (const p of skinned) {
    const m = p.mesh;
    const t = xf.get(p.name);
    if (!m || !t) continue;
    // Bones live in the asset frame: bind-test the part where it sits.
    const positions = new Float32Array(m.positions.length);
    for (let i = 0; i < positions.length; i += 3)
      positions.set(
        toWorld(t, [m.positions[i] ?? 0, m.positions[i + 1] ?? 0, m.positions[i + 2] ?? 0]),
        i,
      );
    const err = bindPoseError({ ...m, positions }, sk, bind);
    if (err > BIND_TOLERANCE)
      out.push(
        finding(
          `part '${p.name}' bind pose is ${err.toExponential(2)} m off its rest positions`,
          'inverse bind matrices must be the inverse of each joint’s rest world matrix (export/skin.ts)',
          p.name,
        ),
      );
  }
  return out;
}

export const skin: Gate = (asset) => skinFindings(asset);
