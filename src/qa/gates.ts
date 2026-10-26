// The QA gate: checks a compiled asset must pass before it ships. A failing gate is a build
// error (exit 1), not a warning — an agent iterates until it prints PASS.

import {
  type Bounds,
  boundsOf,
  type CompiledAsset,
  notImplemented,
  toWorld,
  triangleCount,
  worldTransforms,
} from '../core/index.ts';

export interface Finding {
  readonly gate: string;
  readonly part?: string;
  readonly message: string;
  readonly fix: string;
}

export type Gate = (asset: CompiledAsset) => Finding[];

const worldBounds = (asset: CompiledAsset): Map<string, Bounds> => {
  const xf = worldTransforms(asset.parts);
  const out = new Map<string, Bounds>();
  for (const p of asset.parts) {
    const t = xf.get(p.name);
    if (!t || !p.mesh || p.mesh.indices.length === 0) continue;
    const b = boundsOf(p.mesh);
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      toWorld(t, [
        i & 1 ? b.max[0] : b.min[0],
        i & 2 ? b.max[1] : b.min[1],
        i & 4 ? b.max[2] : b.min[2],
      ]),
    );
    const axis = (k: 0 | 1 | 2, f: (...v: number[]) => number): number =>
      f(...corners.map((c) => c[k]));
    out.set(p.name, {
      min: [axis(0, Math.min), axis(1, Math.min), axis(2, Math.min)],
      max: [axis(0, Math.max), axis(1, Math.max), axis(2, Math.max)],
    });
  }
  return out;
};

export const triangleBudget: Gate = (asset) => {
  const tris = asset.parts.reduce((s, p) => s + (p.mesh ? triangleCount(p.mesh) : 0), 0);
  const cap = asset.budget.triangles[asset.lod];
  return tris > cap
    ? [
        {
          gate: 'triangle-budget',
          message: `LOD${asset.lod} has ${tris} triangles, budget ${cap}`,
          fix: 'drop detail at this LOD (read ctx.lod) or raise the budget with a reason',
        },
      ]
    : [];
};

/** A part whose box touches no other part and not the ground is floating (bad pivot, typo'd z). */
export const floatingParts: Gate = (asset) => {
  const eps = 0.02;
  const boxes = [...worldBounds(asset)];
  const touches = (a: Bounds, b: Bounds): boolean =>
    [0, 1, 2].every(
      (k) => (a.min[k] ?? 0) <= (b.max[k] ?? 0) + eps && (b.min[k] ?? 0) <= (a.max[k] ?? 0) + eps,
    );
  // Connected to the ground through any chain of touching parts.
  const grounded = new Set(boxes.filter(([, b]) => b.min[2] <= eps).map(([n]) => n));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [n, b] of boxes) {
      if (grounded.has(n)) continue;
      if (boxes.some(([m, o]) => grounded.has(m) && touches(b, o))) {
        grounded.add(n);
        grew = true;
      }
    }
  }
  return boxes
    .filter(([n]) => !grounded.has(n))
    .map(([n]) => ({
      gate: 'floating-parts',
      part: n,
      message: `'${n}' touches nothing connected to the ground`,
      fix: 'check its `at` pivot and parent; set `extras: { floating: true }` only for things that truly fly',
    }));
};

export const partNames: Gate = (asset) =>
  asset.parts
    .filter((p) => !/^[a-z][a-z0-9_]*$/.test(p.name))
    .map((p) => ({
      gate: 'part-names',
      part: p.name,
      message: `part '${p.name}' is not snake_case`,
      fix: 'rename it — engines bind to node names like axle_0, door_l',
    }));

/** Planned gates, signatures fixed: docs/idea/06-qa.md. */
export const interpenetration: Gate = () =>
  notImplemented('interpenetration gate (swept over the animation)');
export const silhouetteIoU = (_asset: CompiledAsset, _referencePng: Uint8Array): number =>
  notImplemented('silhouette IoU gate');

export const DEFAULT_GATES: readonly Gate[] = [triangleBudget, floatingParts, partNames];

export function runQa(asset: CompiledAsset, gates: readonly Gate[] = DEFAULT_GATES): Finding[] {
  return gates.flatMap((g) => g(asset));
}
