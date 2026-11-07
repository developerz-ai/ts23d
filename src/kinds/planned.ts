// Kinds with a fixed entry point and no body yet. Each is a library of builders recipes call;
// the roadmap slice that builds it is named in the error.

import { type BuildContext, notImplemented } from '../core/index.ts';

/** Stylised creature from a skeleton + SDF flesh (Spore-like). Realistic ones go via /neural. M4. */
export function creature(
  _ctx: BuildContext,
  _o: { skeleton: 'biped' | 'quadruped' | 'bird'; height: number },
): void {
  notImplemented('creature (SDF-skinned skeleton)', 'docs/idea/07-what-fits.md');
}
