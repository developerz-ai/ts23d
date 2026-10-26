// Gate: the model matches its spec sheet. Each `real.measures` entry (driver diameter, gauge,
// wheelbase, turret width…) is measured on the LOD0 model and must land within tolerance (2%
// default — tighter than the overall box, because these are the numbers players notice).

import {
  type Bounds,
  boundsOf,
  type CompiledAsset,
  type Measure,
  worldMeshes,
} from '../core/index.ts';
import type { Finding, Gate } from './types.ts';

const AXIS = { x: 0, y: 1, z: 2 } as const;

function union(bounds: readonly Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;
  const k = [0, 1, 2] as const;
  return {
    min: k.map((i) => Math.min(...bounds.map((b) => b.min[i]))) as unknown as Bounds['min'],
    max: k.map((i) => Math.max(...bounds.map((b) => b.max[i]))) as unknown as Bounds['max'],
  };
}

export function measure(asset: CompiledAsset, m: Measure): number | null {
  const meshes = worldMeshes(asset.parts);
  const of = (prefix: string): Bounds | null =>
    union(
      [...meshes]
        .filter(([n]) => n === prefix || n.startsWith(`${prefix}_`))
        .map(([, mesh]) => boundsOf(mesh)),
    );
  const k = AXIS[m.axis];
  if (m.between) {
    const [a, b] = [of(m.between[0]), of(m.between[1])];
    if (!a || !b) return null;
    return Math.abs((a.min[k] + a.max[k]) / 2 - (b.min[k] + b.max[k]) / 2);
  }
  const u = union((m.parts ?? []).map(of).filter((b): b is Bounds => b !== null));
  return u ? u.max[k] - u.min[k] : null;
}

export const measures: Gate = (asset): Finding[] => {
  if (asset.lod !== 0 || !asset.real?.measures) return [];
  return asset.real.measures.flatMap((m): Finding[] => {
    const got = measure(asset, m);
    const tol = m.tolerance ?? 0.02;
    if (got === null) {
      return [
        {
          gate: 'measures',
          message: `'${m.label}': no part matches ${JSON.stringify(m.parts ?? m.between)}`,
          fix: 'name the parts the measure refers to, or fix the names in the measure',
        },
      ];
    }
    return Math.abs(got - m.value) / m.value > tol
      ? [
          {
            gate: 'measures',
            message: `${m.label}: ${got.toFixed(3)} m on ${m.axis.toUpperCase()}, spec ${m.value} m (±${tol * 100}%)${m.source ? ` — ${m.source}` : ''}`,
            fix: 'rebuild the part from the spec number; never edit the spec to match the model',
          },
        ]
      : [];
  });
};
