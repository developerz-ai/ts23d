// QA vocabulary shared by every gate: the finding shape, its code rule and the contact tolerances.

import type { CompiledAsset } from '../core/index.ts';

export interface Finding {
  readonly gate: string;
  /** Machine-readable: `T3D_QA_<GATE>`, or the `T3D_*` code the message already carries
   *  (connections, joints, mass, weather). Outside the `ErrorCode` union (errors.md "Finding codes"). */
  readonly code: string;
  readonly part?: string;
  readonly message: string;
  readonly fix: string;
  /** The distance the finding is about, in metres (how far a part floats or is sunk). */
  readonly gap?: number;
  /** The part closest to `part`, when the fix is "move it onto that". */
  readonly nearest?: string;
}

export type Gate = (asset: CompiledAsset) => Finding[];

/** `floating-parts` → `T3D_QA_FLOATING_PARTS`. */
export const qaCode = (gate: string): string =>
  `T3D_QA_${gate.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

/** The `T3D_*` code a message starts with (`T3D_JOINT_GAP joint 'x' …`), else the gate's own. */
export const codeOf = (gate: string, message: string): string =>
  /^T3D_[A-Z0-9_]+/.exec(message)?.[0] ?? qaCode(gate);

/** Contact tolerance: surfaces closer than this touch (metres). */
export const CONTACT_EPS = 0.02;
/** Clash tolerance: penetration deeper than this is a clash (metres). */
export const CLASH_EPS = 0.01;
