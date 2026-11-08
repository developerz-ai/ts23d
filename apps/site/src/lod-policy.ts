// Which LOD the live views open at, and how long a compile is likely to take. Most recipes compile
// in well under a second; a few are heavy: LOD0 meshes near a million triangles (roadster_v10),
// and sculpted characters and creatures, which take 8–30 s at LOD0 even at 50k triangles. Those
// open at LOD1 with a "load LOD0" button. Estimates are measured Bun timings × a browser factor.

import type { Lod } from './compile-protocol.ts';

export interface Weighed {
  readonly kind: string;
  readonly tags: readonly string[];
  /** Triangles per LOD from the committed manifest (empty when there is none). */
  readonly triangles: readonly number[];
}

/** LOD0 above this opens at LOD1 (download size and GPU memory, not just compile time). */
export const HEAVY_TRIANGLES = 150_000;

/** Sculpted bodies (`sculpt` + a character or creature kind) are slow to compile at LOD0. */
const sculpted = (w: Weighed): boolean =>
  w.tags.includes('sculpt') &&
  (w.kind === 'character' || w.kind === 'creature' || w.tags.includes('creature'));

export const isHeavy = (w: Weighed): boolean =>
  (w.triangles[0] ?? 0) > HEAVY_TRIANGLES || sculpted(w);

/** The LOD a live view opens at. */
export const startLod = (w: Weighed): Lod => (isHeavy(w) ? 1 : 0);

/** Browser compiles run a little slower than the Bun timings (dragon LOD1: 3.1 s Bun, 3.3 s Chrome). */
const BROWSER = 1.2;
/** Measured Bun seconds for sculpted heads and creatures, per LOD (worst of the set). */
const SCULPT_SECONDS: readonly [number, number, number] = [26, 7, 1.3];
/** Ordinary recipes: about 400k triangles per second compile + GLB write. */
const TRIS_PER_SECOND = 400_000;

/** Seconds a compile at `lod` probably takes in the browser; null without triangle counts. */
export function estimateSeconds(w: Weighed, lod: Lod): number | null {
  if (sculpted(w)) return SCULPT_SECONDS[lod] * BROWSER;
  const tris = w.triangles[lod];
  if (tris === undefined) return null;
  return (0.2 + tris / TRIS_PER_SECOND) * BROWSER;
}
