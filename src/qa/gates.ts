// The QA gate: checks a compiled asset must pass before it ships. A failing gate is a build
// error (exit 1), not a warning — an agent iterates until it prints PASS.

import {
  boundsOf,
  type CompiledAsset,
  TOLERANCE,
  triangleCount,
  worldMeshes,
} from '../core/index.ts';
import { chainCross } from './chain-cross.ts';
import { runChecks } from './checks.ts';
import { clashes } from './clash.ts';
import { connections } from './connections.ts';
import { deform } from './deform.ts';
import { floatingParts } from './floating.ts';
import { gait } from './gait.ts';
import { gaps } from './gaps.ts';
import { joints } from './joints.ts';
import { mass } from './mass.ts';
import { measures } from './measures.ts';
import { model } from './model.ts';
import { hiddenParts } from './occlusion.ts';
import {
  degenerateTriangles,
  meshArrays,
  nonFinite,
  normalsMatchWinding,
  vertexColors,
} from './sanity.ts';
import { skin } from './skin.ts';
import { swim } from './swim.ts';
import { treads } from './treads.ts';
import type { Finding, Gate } from './types.ts';
import { weatherGate } from './weather.ts';

export const triangleBudget: Gate = (asset) => {
  const tris = asset.parts.reduce((s, p) => s + (p.mesh ? triangleCount(p.mesh) : 0), 0);
  const cap = asset.budget.triangles[asset.lod];
  return tris > cap
    ? [
        {
          gate: 'triangle-budget',
          code: 'T3D_QA_TRIANGLE_BUDGET',
          message: `LOD${asset.lod} has ${tris} triangles, budget ${cap}`,
          fix: 'drop detail at this LOD (read ctx.lod) or raise the budget with a reason',
        },
      ]
    : [];
};

/** A LOD with no triangles exports a GLB with no meshes: some viewers reject it, all show nothing. */
export const emptyAsset: Gate = (asset) =>
  asset.parts.some((p) => p.mesh && p.mesh.indices.length >= 3)
    ? []
    : [
        {
          gate: 'empty',
          code: 'T3D_QA_EMPTY',
          message: `LOD${asset.lod} has no triangles: every mesh is empty or behind a ctx.lod test`,
          fix: 'keep the main masses at every LOD (gate detail on ctx.lod, never the body); a LOD2 of a few hundred triangles is enough',
        },
      ];

export const partNames: Gate = (asset) =>
  asset.parts
    .filter((p) => !/^[a-z][a-z0-9_]*$/.test(p.name))
    .map((p) => ({
      gate: 'part-names',
      code: 'T3D_QA_PART_NAMES',
      part: p.name,
      message: `part '${p.name}' is not snake_case`,
      fix: 'rename it — engines bind to node names like axle_0, door_l',
    }));

const UNITS = [
  [1000, 'millimetres'],
  [100, 'centimetres'],
] as const;
const near = (ratio: number, to: number): boolean => Math.abs(ratio / to - 1) <= 0.1;

/** The fix for a size miss, naming a units slip when the ratio is ~10^2 or ~10^3 either way. */
function sizeFix(axis: string, got: number, want: number): string {
  const plain = `rescale along ${axis} — re-derive the lengths from the sources, don't fudge the tolerance`;
  for (const [f, unit] of UNITS) {
    if (near(want / got, f))
      return `\`real\` is in metres; ${want} looks like ${unit} → ${+(want / f).toPrecision(6)}: declare it in metres (or ${plain})`;
    if (near(got / want, f))
      return `the model is ~${f}× \`real\` along ${axis}: the geometry looks like ${unit}; build in metres (or ${plain})`;
  }
  return plain;
}

/** Overall bounding box vs the recipe's `real` dimensions: catches a 6 m tank modelled at 7.4 m. */
export const proportions: Gate = (asset) => {
  const real = asset.real;
  if (!real || asset.lod !== 0) return [];
  // Bounds of the real world-space vertices: a yawed part's rotated local box over-measures it.
  const boxes = [...worldMeshes(asset.parts).values()]
    .filter((m) => m.indices.length > 0)
    .map(boundsOf);
  const span = (k: 0 | 1 | 2): number =>
    Math.max(...boxes.map((b) => b.max[k])) - Math.min(...boxes.map((b) => b.min[k]));
  const tol = real.tolerance ?? TOLERANCE.proportions;
  return (
    [
      ['length', 0, real.length],
      ['width', 1, real.width],
      ['height', 2, real.height],
    ] as const
  ).flatMap(([axis, k, want]) => {
    const got = span(k);
    // `!(err <= tol)`: a NaN error (zero or non-finite span) fails instead of passing.
    return !(Math.abs(got - want) / want <= tol)
      ? [
          {
            gate: 'proportions',
            code: 'T3D_QA_PROPORTIONS',
            message: `${axis} ${got.toFixed(2)} m vs real ${want} m (±${tol * 100}%)`,
            fix: sizeFix('XYZ'[k] ?? 'X', got, want),
          },
        ]
      : [];
  });
};

export { silhouetteIoU } from './ref-gate.ts';

/** The recipe's own `checks`, each finding reported under the gate name `check`. */
export const recipeChecks: Gate = (asset) =>
  runChecks(asset).map((f) => ({
    gate: 'check',
    code: 'T3D_QA_CHECK',
    ...(f.part ? { part: f.part } : {}),
    message: f.message,
    fix: f.fix,
  }));

export const DEFAULT_GATES: readonly Gate[] = [
  emptyAsset,
  triangleBudget,
  floatingParts,
  connections,
  gaps,
  clashes,
  treads,
  partNames,
  proportions,
  measures,
  joints,
  mass,
  recipeChecks,
  nonFinite,
  vertexColors,
  hiddenParts,
  normalsMatchWinding,
  degenerateTriangles,
  weatherGate,
  skin,
  deform,
  gait,
  swim,
  chainCross,
  model,
];

/** Malformed attribute arrays come back alone: every other gate would read past their end. */
export function runQa(asset: CompiledAsset, gates: readonly Gate[] = DEFAULT_GATES): Finding[] {
  const malformed = meshArrays(asset);
  if (malformed.length > 0) return malformed;
  return gates.flatMap((g) => g(asset));
}
