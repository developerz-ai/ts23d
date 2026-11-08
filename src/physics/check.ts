// Physics intent checks: the rigid-body kind an asset gets by default, option validation, and
// the QA `mass` check — computed mass vs the sourced `real.mass` (T3D_MASS_MISMATCH).

import type { CompiledAsset } from '../core/index.ts';
import { Ts23dError } from '../core/index.ts';
import type { MassProperties } from './mass.ts';

type BodyKind = NonNullable<NonNullable<CompiledAsset['physics']>['body']>;

/** Kinds that never move: static colliders by default. Everything else simulates. */
const STATIC_KINDS = new Set(['building', 'terrain', 'structure', 'scene']);

export function bodyKindOf(asset: CompiledAsset): BodyKind {
  return asset.physics?.body ?? (STATIC_KINDS.has(asset.kind) ? 'static' : 'dynamic');
}

/** Throws T3D_PHYSICS_INVALID on a non-positive mass, density or wall thickness. */
export function checkPhysics(asset: CompiledAsset): void {
  const bad = (what: string, v: number | undefined): void => {
    if (v !== undefined && !(Number.isFinite(v) && v > 0))
      throw new Ts23dError('T3D_PHYSICS_INVALID', {
        cause: `${asset.name}: ${what} is ${v}`,
        fix: 'mass (kg), density (kg/m³) and shell (m) must be finite and > 0; omit them for defaults',
      });
  };
  const p = asset.physics;
  bad('physics.mass', p?.mass);
  bad('physics.shell', p?.shell);
  for (const [k, v] of Object.entries(p?.density ?? {})) bad(`physics.density.${k}`, v);
  for (const part of asset.parts) {
    bad(`part '${part.name}' density`, part.density);
    bad(`part '${part.name}' shell`, part.shell);
  }
}

/** A QA finding shaped like /qa's `Finding` (gate 'mass'). */
export interface MassFinding {
  readonly gate: 'mass';
  readonly message: string;
  readonly fix: string;
}

/**
 * Computed mass vs `real.mass` (± `real.massTolerance`, default 15 %). Uses the computed mass,
 * never a `physics.mass` override: the check is that the geometry and densities add up.
 */
export function massFindings(asset: CompiledAsset, props: MassProperties): MassFinding[] {
  const want = asset.real?.mass;
  if (want === undefined || asset.lod !== 0) return [];
  const tol = asset.real?.massTolerance ?? 0.15;
  const got = props.computedMass;
  const err = (got - want) / want;
  if (Math.abs(err) <= tol) return [];
  const heavy = err > 0;
  return [
    {
      gate: 'mass',
      message: `T3D_MASS_MISMATCH: computed ${(got / 1000).toFixed(2)} t vs real ${(want / 1000).toFixed(2)} t (${(err * 100).toFixed(0)} %, ±${(tol * 100).toFixed(0)} %)${props.openShells ? `; ${props.openShells} open shell(s) counted as convex hulls` : ''}`,
      fix: heavy
        ? 'solid volumes are too heavy: hollow hulls with `physics: { shell: 0.08 }` (wall metres) or per part `{ shell }`, or fix densities via `physics.density` — never set physics.mass to pass'
        : 'too light: check densities (`plain` counts as 1000 kg/m³ — map it with physics.density), thicken `shell`, or close open shells',
    },
  ];
}
