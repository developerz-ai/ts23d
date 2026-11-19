// The triangle-band ratchet: assets over their class band (scripts/lib/budget-bands.ts) on
// 2026-11-19, with the counts they shipped then and what their owner should do next. Listed assets
// warn while they do not grow; an asset fixed (inside its band, or a README `Budget why:` line)
// must be deleted here. Only ever delete entries: scripts/budget-bands.test.ts freezes the list.

import type { Triple } from './budget-bands.ts';

export interface BaselineEntry {
  /** LOD0 / LOD1 / LOD2 triangles shipped when recorded; the asset may not grow past them. */
  readonly triangles: Triple;
  /** The recommendation: reduce to the band, or the reason to write as `Budget why:`. */
  readonly next: string;
}

export const BUDGET_BASELINE: Readonly<Record<string, BaselineEntry>> = {
  asteroid: {
    triangles: [18772, 2036, 360],
    next: 'reduce LOD1/2 to 1.5k/150 (SDF cells)',
  },
  asteroid_b: {
    triangles: [17768, 1980, 320],
    next: 'reduce LOD1/2 to 1.5k/150 (SDF cells)',
  },
  asteroid_c: {
    triangles: [19608, 2076, 356],
    next: 'reduce LOD1/2 to 1.5k/150 (SDF cells)',
  },
  boxcar: {
    triangles: [18878, 7488, 1068],
    next: 'reduce LOD2 to 800 (trucks as blocks)',
  },
  boxcar_nw: {
    triangles: [19054, 7668, 1084],
    next: 'reduce LOD2 to 800 (trucks as blocks)',
  },
  cargo_container_scifi: {
    triangles: [16220, 6950, 170],
    next: 'reduce to 10k/1.5k/40: a container LOD2 is a box',
  },
  rts_barracks: {
    triangles: [36818, 7802, 664],
    next: 'reduce to 20k/6k/800 (RTS crowd view)',
  },
  rts_barracks_damaged: {
    triangles: [33716, 8040, 852],
    next: 'reduce to 20k/6k/800 (RTS crowd view)',
  },
  rts_resource: {
    triangles: [8238, 1910, 282],
    next: 'reduce to 5k/1.5k/300 (crystal facets)',
  },
  rts_resource_depleted: {
    triangles: [8698, 2026, 286],
    next: 'reduce to 5k/1.5k/300 (crystal facets)',
  },
};
