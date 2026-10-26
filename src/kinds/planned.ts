// Kinds with a fixed entry point and no body yet. Each is a library of builders recipes call;
// the roadmap slice that builds it is named in the error.

import { type BuildContext, notImplemented, type Vec3 } from '../core/index.ts';

/** Hull from length/beam/draft + sheer and keel curves (lofted sections). M2. */
export function hull(
  _ctx: BuildContext,
  _o: { length: number; beam: number; draft: number; freeboard: number; color: Vec3 },
): void {
  notImplemented('hull (vessel kind)');
}

/** Weber–Penn botanical skeleton: recursive branch levels, leaf cards, wind weights, impostor LOD2. M3. */
export function tree(
  _ctx: BuildContext,
  _o: { species: string; height: number; seed?: number },
): void {
  notImplemented('tree (vegetation kind)');
}

/** Pitched roofs over a footprint: hip, gable, pyramid, mansard. M1. */
export function roof(
  _ctx: BuildContext,
  _o: {
    type: 'hip' | 'gable' | 'pyramid' | 'mansard';
    footprint: readonly [number, number];
    pitchDeg: number;
    at: Vec3;
    color: Vec3;
  },
): void {
  notImplemented('roof (building kind)');
}

/** Stylised creature from a skeleton + SDF flesh (Spore-like). Realistic ones go via /neural. M4. */
export function creature(
  _ctx: BuildContext,
  _o: { skeleton: 'biped' | 'quadruped' | 'bird'; height: number },
): void {
  notImplemented('creature (SDF-skinned skeleton)', 'docs/idea/07-what-fits.md');
}
