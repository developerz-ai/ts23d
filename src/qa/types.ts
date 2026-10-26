// QA vocabulary shared by every gate.

import type { CompiledAsset } from '../core/index.ts';

export interface Finding {
  readonly gate: string;
  readonly part?: string;
  readonly message: string;
  readonly fix: string;
}

export type Gate = (asset: CompiledAsset) => Finding[];

/** Contact tolerance: surfaces closer than this touch (metres). */
export const CONTACT_EPS = 0.02;
/** Clash tolerance: penetration deeper than this is a clash (metres). */
export const CLASH_EPS = 0.01;
