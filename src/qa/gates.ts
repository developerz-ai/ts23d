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
import { runChecks } from './checks.ts';
import { clashes } from './clash.ts';
import { floatingParts } from './floating.ts';
import { measures } from './measures.ts';
import type { Finding, Gate } from './types.ts';

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

export const partNames: Gate = (asset) =>
  asset.parts
    .filter((p) => !/^[a-z][a-z0-9_]*$/.test(p.name))
    .map((p) => ({
      gate: 'part-names',
      part: p.name,
      message: `part '${p.name}' is not snake_case`,
      fix: 'rename it — engines bind to node names like axle_0, door_l',
    }));

/** Overall bounding box vs the recipe's `real` dimensions: catches a 6 m tank modelled at 7.4 m. */
export const proportions: Gate = (asset) => {
  const real = asset.real;
  if (!real || asset.lod !== 0) return [];
  const boxes = [...worldBounds(asset).values()];
  const span = (k: 0 | 1 | 2): number =>
    Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k]));
  const tol = real.tolerance ?? 0.05;
  return (
    [
      ['length', 0, real.length],
      ['width', 1, real.width],
      ['height', 2, real.height],
    ] as const
  ).flatMap(([axis, k, want]) => {
    const got = span(k);
    return Math.abs(got - want) / want > tol
      ? [
          {
            gate: 'proportions',
            message: `${axis} ${got.toFixed(2)} m vs real ${want} m (±${tol * 100}%)`,
            fix: `rescale along ${'XYZ'[k]} — re-derive the lengths from the sources, don't fudge the tolerance`,
          },
        ]
      : [];
  });
};

/** Planned gates, signatures fixed: docs/idea/06-qa.md. */
export const silhouetteIoU = (_asset: CompiledAsset, _referencePng: Uint8Array): number =>
  notImplemented('silhouette IoU gate');

/** The recipe's own `checks`, each finding reported under the gate name `check`. */
export const recipeChecks: Gate = (asset) =>
  runChecks(asset).map((f) => ({
    gate: 'check',
    ...(f.part ? { part: f.part } : {}),
    message: f.message,
    fix: f.fix,
  }));

export const DEFAULT_GATES: readonly Gate[] = [
  triangleBudget,
  floatingParts,
  clashes,
  partNames,
  proportions,
  measures,
  recipeChecks,
];

export function runQa(asset: CompiledAsset, gates: readonly Gate[] = DEFAULT_GATES): Finding[] {
  return gates.flatMap((g) => g(asset));
}
