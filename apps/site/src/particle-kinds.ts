// Per-kind look and physics for recipe emitters. A recipe says *what* (smoke, steam, dust…) and
// how much; these presets say how it moves and blends.

import type { Emitter } from '@developerz-ai/ts23d';

export type Kind = Emitter['kind'];

export interface KindStyle {
  /** Additive for light (fire, muzzle, sparks); normal for matter (smoke, steam, dust). */
  readonly additive: boolean;
  /** Linear sRGB colour when the recipe gives none. */
  readonly color: readonly [number, number, number];
  readonly alpha: number;
  /** Upward acceleration m/s² (negative falls). */
  readonly buoyancy: number;
  /** Velocity damping per second. */
  readonly drag: number;
}

export const KINDS: Record<Kind, KindStyle> = {
  smoke: { additive: false, color: [0.09, 0.09, 0.09], alpha: 0.55, buoyancy: 0.8, drag: 0.9 },
  steam: { additive: false, color: [0.82, 0.83, 0.86], alpha: 0.5, buoyancy: 1.3, drag: 1.2 },
  dust: { additive: false, color: [0.3, 0.22, 0.13], alpha: 0.42, buoyancy: 0.15, drag: 2.2 },
  muzzle: { additive: true, color: [1, 0.55, 0.18], alpha: 1, buoyancy: 0, drag: 7 },
  fire: { additive: true, color: [1, 0.32, 0.05], alpha: 0.9, buoyancy: 1.6, drag: 1 },
  sparks: { additive: true, color: [1, 0.7, 0.3], alpha: 1, buoyancy: -9.81, drag: 0.3 },
};

/** Live-particle cap for one emitter, whatever its rate × life asks for. */
export const PER_EMITTER_CAP = 160;

export const capFor = (e: Emitter): number =>
  Math.max(4, Math.min(PER_EMITTER_CAP, Math.ceil(e.rate * e.life * 1.2)));
